#!/usr/bin/env python3
"""
worker.py -- long-lived consolidation worker for the easyCV web app.

Polls Convex for queued uploads, claims one at a time, runs the same
extract -> consolidate -> score -> latex pipeline as `pipeline.py
consolidate-stdin` (via pipeline.consolidate_files(), the shared
implementation), and writes results back to Convex.

WHY THIS EXISTS AS A SEPARATE, LONG-LIVED PROCESS:

The web upload route used to call `pipeline.py consolidate-stdin` directly
and block the HTTP response on it. That cannot work in production: standard
Netlify Functions time out at 10-26s, and LLM consolidation routinely takes
90-300+s (worse against a local/self-hosted model doing "thinking"). Even
Netlify's documented background-function escape hatch is explicitly
Pages-Router-only with no confirmed App Router support. Running this as an
ordinary long-lived process instead sidesteps every serverless timeout
question entirely -- there isn't one. Run it anywhere with network access to
Convex and (if using Ollama) your LLM backend: this laptop, a small VPS, or
the same always-on Tailscale-networked box already running Ollama.

BOUNDED RETRY ("loop until successful without tailspinning out of
control"): each upload gets at most `uploads.MAX_ATTEMPTS` (enforced
server-side in Convex, see convex/uploads.ts -- not trusted to this
process's own memory) processing attempts before Convex marks it a
terminal "error" with a user-facing message. A failed attempt requeues
the job; the natural poll interval between claims acts as backoff. This
process never retries a single upload in a tight loop.

Usage:
    uv run python -m backend.worker
    uv run python -m backend.worker --poll-interval 5 --convex-url http://127.0.0.1:3210

Config (env vars, loaded from web/.env.local if present -- same file
Next.js itself reads -- explicit env vars always take precedence):
    NEXT_PUBLIC_CONVEX_URL / CONVEX_URL   Convex deployment to talk to
    WORKER_SECRET                          shared secret, see convex/workerAuth.ts
    LLM_PROVIDER, LLM_MODEL, OLLAMA_API_BASE, OLLAMA_TIMEOUT
                                            same vars pipeline.py's LLMClient reads
"""

import argparse
import os
import shutil
import signal
import sys
import tempfile
import time
import traceback
from pathlib import Path
from typing import Optional

import requests
from convex import ConvexClient
from dotenv import load_dotenv

from backend import pipeline
from backend.pipeline import LLMClient

DEFAULT_POLL_INTERVAL = 3  # seconds between claim attempts when idle
DOWNLOAD_TIMEOUT = 60  # seconds, per resume file fetched from Convex storage


def load_config() -> tuple[str, str]:
    env_path = Path(__file__).parent.parent / "web" / ".env.local"
    if env_path.exists():
        # override=True deliberately: web/.env.local is this project's own
        # canonical local config, not incidental ambient shell state.
        # Caught live: a stale OLLAMA_API_BASE left over in an interactive
        # shell (pointing at a plain-LAN address unreachable from this
        # machine's actual network position) silently beat .env.local's
        # correct, intentionally-configured Tailscale address when this
        # was override=False, and the worker failed against an address
        # nobody meant it to use. --convex-url/--worker-secret CLI flags
        # (see main()) remain the way to deliberately override this file
        # for a one-off run.
        load_dotenv(env_path, override=True)

    convex_url = os.environ.get("NEXT_PUBLIC_CONVEX_URL") or os.environ.get("CONVEX_URL")
    worker_secret = os.environ.get("WORKER_SECRET")
    if not convex_url:
        sys.exit("[worker] NEXT_PUBLIC_CONVEX_URL or CONVEX_URL must be set (see web/.env.local)")
    if not worker_secret:
        sys.exit("[worker] WORKER_SECRET must be set (see web/.env.local, must match "
                  "`npx convex env set WORKER_SECRET ...` on the deployment)")
    return convex_url, worker_secret


# --- Profile field mapping ----------------------------------------------
#
# Mirrors web/lib/profileMapping.ts's profileFieldsFrom() EXACTLY -- same
# defensive coercion (missing/null/wrong-typed LLM output must not crash
# the save), same field shape saveStructuredProfile expects, same
# snake_case->camelCase rename for languages_spoken. Duplicated here
# rather than shared because that mapping lives in TypeScript and this is
# a Python process; keep the two in sync by hand if either changes. A
# more robust long-term fix would move this coercion server-side into the
# saveStructuredProfile Convex mutation itself, so every caller (Next.js,
# this worker, anything else later) gets it for free instead of each
# caller reimplementing it -- tracked as a backlog follow-up, not done
# here to keep this change's scope bounded.

def _as_str(value) -> Optional[str]:
    return value if isinstance(value, str) and value else None


def _as_str_list(value) -> Optional[list[str]]:
    if not isinstance(value, list):
        return None
    return [v for v in value if isinstance(v, str)]


def _as_str_list_required(value) -> list[str]:
    return _as_str_list(value) or []


def _as_contact(value) -> Optional[dict]:
    if not isinstance(value, dict):
        return None
    out = {}
    for key in ("email", "phone", "location", "linkedin", "website"):
        v = _as_str(value.get(key))
        if v:
            out[key] = v
    return out


def _as_skills(value) -> Optional[dict]:
    if not isinstance(value, dict):
        return None
    return {
        "languages": _as_str_list_required(value.get("languages")),
        "frameworks": _as_str_list_required(value.get("frameworks")),
        "cloud_devops": _as_str_list_required(value.get("cloud_devops")),
        "databases": _as_str_list_required(value.get("databases")),
        "tools": _as_str_list_required(value.get("tools")),
    }


def _as_experience(value) -> Optional[list[dict]]:
    # Every optional field below must be OMITTED, not set to None, when
    # absent -- caught live: Convex's v.optional(v.string()) accepts a
    # missing key or a string, but NOT an explicit null. Python's None
    # serializes to JSON null (unlike JS's undefined, which the original
    # TypeScript profileFieldsFrom relies on getting silently dropped by
    # JSON.stringify before it reaches Convex) -- a dict literal with
    # always-present, sometimes-None values broke saveStructuredProfile
    # the first time this ran against a real LLM response with a missing
    # field (education[0].degree: null).
    if not isinstance(value, list):
        return None
    out = []
    for entry in value:
        if not isinstance(entry, dict):
            continue
        mapped = {"bullets": _as_str_list_required(entry.get("bullets"))}
        for key in ("title", "company", "start", "end", "location"):
            v = _as_str(entry.get(key))
            if v:
                mapped[key] = v
        out.append(mapped)
    return out


def _as_education(value) -> Optional[list[dict]]:
    # See _as_experience's comment -- same None-vs-omitted issue applies here.
    if not isinstance(value, list):
        return None
    out = []
    for entry in value:
        if not isinstance(entry, dict):
            continue
        mapped = {}
        for key in ("degree", "school", "years"):
            v = _as_str(entry.get(key))
            if v:
                mapped[key] = v
        out.append(mapped)
    return out


def profile_fields_from(profile: dict) -> dict:
    """Convert consolidate_files()'s `profile` dict into the field set
    profiles:saveStructuredProfile expects. Handles the {"_raw": "..."}
    fallback shape the same way the TS mapping does."""
    if not isinstance(profile, dict):
        return {"rawFallback": "invalid profile payload"}
    if "_raw" in profile:
        raw = profile["_raw"]
        return {"rawFallback": raw if isinstance(raw, str) else str(raw)}

    fields = {
        "name": _as_str(profile.get("name")),
        "contact": _as_contact(profile.get("contact")),
        "titles": _as_str_list(profile.get("titles")),
        "summary": _as_str(profile.get("summary")),
        "skills": _as_skills(profile.get("skills")),
        "experience": _as_experience(profile.get("experience")),
        "education": _as_education(profile.get("education")),
        "certifications": _as_str_list(profile.get("certifications")),
        "languagesSpoken": _as_str_list(profile.get("languages_spoken")),
    }
    # Convex mutation args don't accept explicit `undefined`/None for
    # optional fields the same way JSON.stringify silently drops them on
    # the TS side -- omit None values entirely rather than sending them.
    return {k: v for k, v in fields.items() if v is not None}


def upload_bytes_to_convex(client: ConvexClient, convex_url: str, file_path: str, content_type: str) -> str:
    """Convex's standard out-of-band upload pattern: mint a short-lived
    signed URL via a mutation, POST raw bytes to it, read storageId back
    from the response. Mirrors app/api/upload/route.ts's
    uploadBytesToConvexStorage()."""
    upload_url = client.mutation("files:generateUploadUrl", {})
    with open(file_path, "rb") as f:
        resp = requests.post(upload_url, data=f, headers={"Content-Type": content_type}, timeout=DOWNLOAD_TIMEOUT)
    resp.raise_for_status()
    return resp.json()["storageId"]


def process_upload(client: ConvexClient, convex_url: str, worker_secret: str, upload_id: str) -> None:
    print(f"[worker] processing {upload_id}")
    files = client.query(
        "resumeFiles:getResumeFilesForWorker",
        {"uploadId": upload_id, "workerSecret": worker_secret},
    )
    if not files:
        raise RuntimeError("no resume files found for this upload")

    download_dir = tempfile.mkdtemp(prefix="cv-worker-dl-")
    consolidate_tmp_dir = None
    try:
        local_paths = []
        for f in files:
            resp = requests.get(f["url"], timeout=DOWNLOAD_TIMEOUT)
            resp.raise_for_status()
            local_path = os.path.join(download_dir, f["filename"])
            with open(local_path, "wb") as out:
                out.write(resp.content)
            local_paths.append(local_path)

        provider = os.environ.get("LLM_PROVIDER", "ollama")
        model = os.environ.get("LLM_MODEL")
        llm_client = LLMClient(provider=provider, model=model)

        result = pipeline.consolidate_files(local_paths, llm_client)
        consolidate_tmp_dir = result["tmp_dir"]

        client.mutation("profiles:saveStructuredProfile", {
            "uploadId": upload_id,
            **profile_fields_from(result["profile"]),
            "qualityScore": result["score"]["score"],
            "qualityMaxScore": result["score"]["max_score"],
            "qualityWarnings": result["score"]["warnings"],
            "qualityCritical": result["score"]["critical"],
        })

        if result["pdf_path"]:
            pdf_storage_id = upload_bytes_to_convex(client, convex_url, result["pdf_path"], "application/pdf")
            client.mutation("profiles:setProfilePdf", {"uploadId": upload_id, "pdfStorageId": pdf_storage_id})

        client.mutation("uploads:markReady", {"uploadId": upload_id, "workerSecret": worker_secret})
        print(f"[worker] {upload_id} ready")
    finally:
        shutil.rmtree(download_dir, ignore_errors=True)
        if consolidate_tmp_dir:
            shutil.rmtree(consolidate_tmp_dir, ignore_errors=True)


_shutdown_requested = False


def _handle_shutdown_signal(signum, frame):
    global _shutdown_requested
    print(f"\n[worker] received signal {signum}, finishing current job then exiting...")
    _shutdown_requested = True


def main():
    parser = argparse.ArgumentParser(description="Long-lived consolidation worker for easyCV")
    parser.add_argument("--convex-url", default=None, help="Overrides NEXT_PUBLIC_CONVEX_URL/CONVEX_URL")
    parser.add_argument("--worker-secret", default=None, help="Overrides WORKER_SECRET")
    parser.add_argument("--poll-interval", type=float, default=DEFAULT_POLL_INTERVAL,
                        help=f"Seconds to wait between claim attempts when idle (default: {DEFAULT_POLL_INTERVAL})")
    parser.add_argument("--once", action="store_true",
                        help="Process at most one queued upload, then exit (useful for testing/cron-style runs)")
    args = parser.parse_args()

    convex_url, worker_secret = load_config()
    convex_url = args.convex_url or convex_url
    worker_secret = args.worker_secret or worker_secret

    signal.signal(signal.SIGINT, _handle_shutdown_signal)
    signal.signal(signal.SIGTERM, _handle_shutdown_signal)

    client = ConvexClient(convex_url)
    print(f"[worker] connected to {convex_url}, polling every {args.poll_interval}s "
          f"(Ctrl+C to stop after the current job)")

    while not _shutdown_requested:
        try:
            upload_id = client.mutation("uploads:claimNextQueued", {"workerSecret": worker_secret})
        except Exception as e:
            print(f"[worker] claim failed: {e}", file=sys.stderr)
            time.sleep(args.poll_interval)
            continue

        if not upload_id:
            if args.once:
                print("[worker] nothing queued, exiting (--once)")
                return
            time.sleep(args.poll_interval)
            continue

        try:
            process_upload(client, convex_url, worker_secret, upload_id)
        except Exception as e:
            reason = str(e) or type(e).__name__
            print(f"[worker] {upload_id} failed: {reason}", file=sys.stderr)
            traceback.print_exc(file=sys.stderr)
            try:
                client.mutation("uploads:markAttemptFailed", {
                    "uploadId": upload_id,
                    "workerSecret": worker_secret,
                    # Short, user-facing reason -- never the raw traceback.
                    "reason": "Consolidation failed. It will be retried automatically." ,
                })
            except Exception as mark_err:
                print(f"[worker] also failed to record the failure: {mark_err}", file=sys.stderr)

        if args.once:
            return

    print("[worker] stopped")


if __name__ == "__main__":
    main()
