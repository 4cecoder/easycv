#!/usr/bin/env python3
"""
EasyCV Resume Processing Pipeline
===================================
This is the CORE resume processing pipeline for EasyCV.

NOT to be confused with automation/test_suite.py, which provides test runners
for the automation framework (pytest, typecheck, playwright, etc.).

This pipeline handles:
- PDF text extraction (OCR, PyPDF2)
- Resume content parsing
- LLM-based consolidation (OpenAI, Anthropic, Ollama)
- STE-100 Simplified Technical English validation
- LaTeX/PDF generation
- Worker daemon for background processing

Usage:
    # Basic — scan common dirs, use Ollama (default, no API key needed)
    python pipeline.py scan --auto

    # With specific dirs and OpenAI
    python pipeline.py scan ~/Downloads ~/Desktop --llm openai

    # Dry run to preview before copying
    python pipeline.py scan ~/Downloads --dry-run

    # Full pipeline with Anthropic
    python pipeline.py scan --auto --llm anthropic --output ./my_resumes

Config:
    API keys via env vars:  OPENAI_API_KEY, ANTHROPIC_API_KEY
    Or ~/.config/cv-pipeline/config.json:
      {"llm": {"provider": "openai", "model": "gpt-4o", "api_key": "sk-..."}}
"""

import argparse
import contextlib
import json
import logging
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Optional

from backend.constants import (
    BYTES_PER_KB,
    DEFAULT_MAX_TOKENS_CONSOLIDATION,
    DEFAULT_MAX_TOKENS_JOB_MATCH,
    DEFAULT_MAX_TOKENS_RESUME,
    DEFAULT_SORT_PRIORITY,
    LATEX_COMPILE_TIMEOUT,
    PDF_TEXT_TIMEOUT,
    TEXT_TRUNCATION_LENGTH,
)
logger = logging.getLogger(__name__)

from backend import latex
from backend import ste100

try:
    from backend.needle_extractor import NeedleExtractor, NEEDLE_AVAILABLE
except ImportError:
    NEEDLE_AVAILABLE = False


# ── Config ─────────────────────────────────────

DEFAULT_SEARCH_DIRS = [
    os.path.expanduser("~/Downloads"),
    os.path.expanduser("~/Desktop"),
    os.path.expanduser("~/Documents"),
]

CV_PATTERNS = re.compile(
    r"(?i)(cv|resume|curriculum[\s_-]?vitae|profile|linkedin|career)",
)
NAME_HINTS = re.compile(
    r"(?i)(?:^|[/\\])([a-z]+[_\-\s]?[a-z]+?)(?:_cv|_resume|_profile|__cv|cv\.|resume\.)",
)
SKIP_DIRS = {"node_modules", ".git", "__pycache__", ".Trash", "Library"}
VALID_EXT = {".pdf", ".docx", ".doc", ".pages", ".txt", ".md"}

CV_CLASSIFY_PATTERN = re.compile(r"(?i)\bcv\b")
SUFFIX_BEFORE_NAME_PATTERN = re.compile(r"(?i)(?:^|[/\\])(?:cv|resume|profile|linkedin)[_\-\s]+([a-z]+(?:[_\-\s][a-z]+)?)")
FALLBACK_SPLIT_PATTERN = re.compile(r"(?i)_+cv|_resume|_profile|linkedin|profile")

LLM_PROVIDER_MODELS = {
    "openai": "gpt-4o",
    "anthropic": "claude-sonnet-4-20250514",
    "ollama": "llama3.2",
}

CONFIG_PATH = os.path.expanduser("~/.config/cv-pipeline/config.json")

REQUIRED_STRUCTURED_KEYS = {"name", "skills", "experience"}
SUPPORTED_EXTRACT_EXT = {".txt", ".md", ".pdf"}


# ── Data Model ──────────────────────────────────


@dataclass
class FoundFile:
    path: str
    filename: str
    ext: str
    size_kb: int
    person: str
    category: str
    notes: str = ""

@dataclass
class PersonBundle:
    name: str = ""
    files: list[FoundFile] = field(default_factory=list)
    extracted_texts: dict = field(default_factory=dict)


# ── Helpers ─────────────────────────────────────


def slug(name: str) -> str:
    name = name.strip().lower()
    name = re.sub(r"[^a-z0-9]+", "-", name).strip("-")
    return name or "unknown"

def classify(filename: str) -> str:
    low = filename.lower()
    if "linkedin" in low: return "linkedin"
    if "profile" in low: return "profile"
    if "resume" in low: return "resume"
    if CV_CLASSIFY_PATTERN.search(low): return "cv"
    if "cover" in low and "letter" in low: return "cover-letter"
    return "other"

def _load_aliases() -> dict:
    p = os.path.expanduser("~/.config/cv-pipeline/aliases.json")
    if os.path.exists(p):
        try:
            with open(p) as f:
                data = json.load(f)
                if isinstance(data, dict):
                    return data
        except (json.JSONDecodeError, OSError):
            pass
    return {}

def _resolve_alias(name: str, aliases: dict) -> Optional[str]:
    """Check both exact and substring matches in aliases. Shared by extract_person and _merge_bundles."""
    if not isinstance(aliases, dict):
        return None
    if name in aliases:
        return aliases[name]
    for k, v in aliases.items():
        if isinstance(k, str) and isinstance(v, str):
            if k in name or name in k:
                return v
    return None

def _format_name(raw: str) -> str:
    """Capitalize first letter of each word, preserving internal caps like Mac, O'Brien."""
    return " ".join(
        w[0].upper() + w[1:] if w else ""
        for w in raw.strip().split()
    )

def extract_person(filename: str) -> Optional[str]:
    aliases = _load_aliases()
    cleaned = re.sub(r"[-_]\d{4}(?:_\d(?:-\d)?)?", "", filename)
    cleaned = re.sub(r"[-_]\d+-\d(?:-\d)?", "", cleaned)

    # Try standard name-before-suffix pattern first
    m = NAME_HINTS.search(cleaned)
    if m:
        raw = m.group(1).strip(" _-")
        raw = re.sub(r"\s+", " ", raw)
        aliased = _resolve_alias(raw.lower(), aliases)
        return aliased if aliased else _format_name(raw)

    # Try suffix-before-name pattern: cv_john.pdf, resume_alice.pdf
    m2 = SUFFIX_BEFORE_NAME_PATTERN.search(cleaned)
    if m2:
        raw = m2.group(1).strip(" _-")
        raw = re.sub(r"\s+", " ", raw)
        aliased = _resolve_alias(raw.lower(), aliases)
        return aliased if aliased else _format_name(raw)

    # Fallback: extract before known suffixes
    parts = FALLBACK_SPLIT_PATTERN.split(cleaned)
    if parts and parts[0].strip():
        candidate = parts[0].strip().rstrip(" _-")
        candidate = re.sub(r"\d+.*", "", candidate).strip(" _-")
        if candidate and not re.match(r"^[\d\W]+$", candidate):
            aliased = _resolve_alias(candidate.lower(), aliases)
            return aliased if aliased else _format_name(candidate)
    return None

def is_cv_related(filename: str) -> bool:
    return bool(CV_PATTERNS.search(filename))

def should_skip_dir(dirpath: str) -> bool:
    return any(s in Path(dirpath).parts for s in SKIP_DIRS)

def fmt_size(path: str) -> int:
    try:
        return round(os.path.getsize(path) / BYTES_PER_KB)
    except OSError:
        return 0


# ── Scan & Organize ────────────────────────────


def scan_directories(dirs: list[str]) -> dict[str, PersonBundle]:
    bundles: dict[str, PersonBundle] = defaultdict(lambda: PersonBundle(name=""))
    seen = set()
    for top_dir in dirs:
        top_dir = os.path.abspath(top_dir)
        if not os.path.isdir(top_dir):
            print(f"  [warn] not a directory: {top_dir}")
            continue
        for root, dirs_inner, files in os.walk(top_dir):
            root = os.path.abspath(root)
            if should_skip_dir(root):
                dirs_inner.clear(); continue
            dirs_inner[:] = [d for d in dirs_inner if d[0] != "."]
            for fname in files:
                ext = os.path.splitext(fname)[1].lower()
                if ext not in VALID_EXT: continue
                if not is_cv_related(fname): continue
                fpath = os.path.join(root, fname)
                rp = os.path.realpath(fpath)
                if rp in seen: continue
                seen.add(rp)
                person = extract_person(fname) or "unknown"
                ff = FoundFile(path=fpath, filename=fname, ext=ext,
                               size_kb=fmt_size(fpath), person=person, category=classify(fname))
                bundles[person].name = person
                bundles[person].files.append(ff)
    return _merge_bundles(dict(bundles))

def _merge_bundles(bundles: dict[str, PersonBundle]) -> dict[str, PersonBundle]:
    aliases = _load_aliases()
    aliased: dict[str, PersonBundle] = {}
    for key, bundle in bundles.items():
        canonical = _resolve_alias(key.lower(), aliases) or key
        if canonical not in aliased:
            aliased[canonical] = PersonBundle(name=canonical)
        aliased[canonical].files.extend(bundle.files)
    unknown = aliased.pop("unknown", None)
    if unknown and unknown.files:
        if aliased:
            primary = max(aliased.values(), key=lambda b: len(b.files))
            primary.files.extend(unknown.files)
            print(f"  [merge] {len(unknown.files)} orphan files → {primary.name}")
        else:
            aliased["unknown"] = unknown
    cat_order = {"cv": 0, "resume": 1, "linkedin": 2, "profile": 3}
    for b in aliased.values():
        b.files.sort(key=lambda f: (cat_order.get(f.category, DEFAULT_SORT_PRIORITY), f.filename))
    return aliased

def _unique_dest(dir_path: str, filename: str) -> str:
    """Return a collision-free destination path for *filename* inside *dir_path*,
    appending _dup / _dup2 / ... suffixes as needed. Shared by organize_files and
    redetect_command's --apply move step."""
    dest = os.path.join(dir_path, filename)
    if not os.path.exists(dest):
        return dest
    base, ext = os.path.splitext(filename)
    candidate = os.path.join(dir_path, f"{base}_dup{ext}")
    counter = 2
    while os.path.exists(candidate):
        candidate = os.path.join(dir_path, f"{base}_dup{counter}{ext}")
        counter += 1
    return candidate

def organize_files(bundles: dict[str, PersonBundle], output_dir: str, dry_run: bool = False) -> None:
    for person, bundle in bundles.items():
        person_dir = os.path.join(output_dir, "resources", slug(person))
        person_dir = os.path.abspath(person_dir)
        if not dry_run:
            os.makedirs(person_dir, exist_ok=True)
        for ff in bundle.files:
            safe_name = os.path.basename(ff.filename)
            dest = os.path.join(person_dir, safe_name)
            # Prevent path traversal
            dest = os.path.abspath(dest)
            if not dest.startswith(person_dir + os.sep):
                print(f"  [warn] skipping malicious path: {ff.filename}")
                continue
            dest = _unique_dest(person_dir, safe_name)
            if dry_run:
                print(f"  [copy] {safe_name} → {dest}")
            else:
                shutil.copy2(ff.path, dest)
        if not dry_run and bundle.files:
            cats = ", ".join(sorted(set(f.category for f in bundle.files)))
            print(f"  [{slug(person)}] {len(bundle.files)} files ({cats})")


def bundles_from_resources(output_dir: str, person_filter: Optional[str] = None) -> dict[str, PersonBundle]:
    """Rebuild PersonBundle objects from an already-organized output dir's
    resources/{person}/ folders, without re-scanning original source directories.

    Each resources/ subdirectory name is a slug() (lowercase-hyphenated), so the
    display name is reconstructed by title-casing its hyphen-separated words; this
    always round-trips back through slug() to the same directory name, which keeps
    consolidated/resume filenames stable across reruns. Used by the rescore,
    redetect, and stats subcommands.

    person_filter, if given, is matched against slug(person_filter) so callers can
    pass either a display name ("Alice Smith") or a slug ("alice-smith").
    """
    resources_dir = os.path.join(output_dir, "resources")
    bundles: dict[str, PersonBundle] = {}
    if not os.path.isdir(resources_dir):
        return bundles
    target_slug = slug(person_filter) if person_filter else None
    for dirname in sorted(os.listdir(resources_dir)):
        person_dir = os.path.join(resources_dir, dirname)
        if not os.path.isdir(person_dir):
            continue
        if target_slug and target_slug != dirname:
            continue
        display_name = " ".join(w.capitalize() for w in dirname.split("-") if w) or dirname
        bundle = PersonBundle(name=display_name)
        for fname in sorted(os.listdir(person_dir)):
            fpath = os.path.join(person_dir, fname)
            if not os.path.isfile(fpath):
                continue
            ext = os.path.splitext(fname)[1].lower()
            if ext not in VALID_EXT:
                continue
            bundle.files.append(FoundFile(
                path=fpath, filename=fname, ext=ext,
                size_kb=fmt_size(fpath), person=display_name, category=classify(fname),
            ))
        if bundle.files:
            bundles[display_name] = bundle
    return bundles


# ── Text Extraction ────────────────────────────


def extract_text(filepath: str) -> Optional[str]:
    ext = os.path.splitext(filepath)[1].lower()
    if ext in SUPPORTED_EXTRACT_EXT:
        if ext == ".pdf":
            try:
                r = subprocess.run(["pdftotext", filepath, "-"], capture_output=True, text=True, timeout=PDF_TEXT_TIMEOUT)
                if r.returncode == 0 and r.stdout.strip(): return r.stdout
            except (FileNotFoundError, subprocess.TimeoutExpired): pass
            try:
                import fitz
                doc = fitz.open(filepath)
                pages_text = []
                is_linkedin = "linkedin" in os.path.basename(filepath).lower()
                for page in doc:
                    if is_linkedin:
                        w = page.rect.width
                        h = page.rect.height
                        split_x = w * 0.33
                        main_rect = fitz.Rect(split_x, 0, w, h)
                        side_rect = fitz.Rect(0, 0, split_x, h)
                        main_t = page.get_text("text", clip=main_rect)
                        side_t = page.get_text("text", clip=side_rect)
                        pages_text.append(f"--- BODY ---\n{main_t}\n--- SIDEBAR ---\n{side_t}")
                    else:
                        pages_text.append(page.get_text())
                doc.close()
                text = "\n".join(pages_text)
                if text.strip(): return text
            # Broad catch is intentional: fitz may not be installed in all envs.
            except Exception: pass
        else:  # .txt, .md
            try:
                with open(filepath, "r", errors="replace") as f: return f.read()
            except OSError: pass
    return None

def extract_all(bundles: dict[str, PersonBundle]) -> dict[str, PersonBundle]:
    print("\n--- Extracting Text ---")
    for person, bundle in bundles.items():
        for ff in bundle.files:
            text = extract_text(ff.path)
            if text:
                bundle.extracted_texts[ff.filename] = text
                print(f"  [{slug(person)}] {ff.filename} → {len(text.strip().splitlines())} lines")
            else:
                print(f"  [{slug(person)}] {ff.filename} → [extraction failed]")
    return bundles


# ── LLM Client ─────────────────────────────────


def _load_config() -> dict:
    cfg = {}
    if os.path.exists(CONFIG_PATH):
        try:
            with open(CONFIG_PATH) as f:
                cfg = json.load(f)
        except (json.JSONDecodeError, OSError) as e:
            logger.debug(f"Could not load config: {e}")
    return cfg.get("llm", {})

def _write_config(updates: dict):
    Path(CONFIG_PATH).parent.mkdir(parents=True, exist_ok=True)
    cfg = {}
    if os.path.exists(CONFIG_PATH):
        try:
            with open(CONFIG_PATH) as f:
                cfg = json.load(f)
        except (json.JSONDecodeError, OSError) as e:
            logger.debug(f"Could not load config for writing: {e}")
    llm = cfg.get("llm", {})
    llm.update(updates)
    cfg["llm"] = llm
    with open(CONFIG_PATH, "w") as f: json.dump(cfg, f, indent=2)


class LLMClient:
    """Pluggable LLM client supporting OpenAI, Anthropic, and Ollama."""

    def __init__(self, provider: str = "ollama", model: Optional[str] = None, api_key: Optional[str] = None):
        self.provider = provider.lower()
        self.model = model or LLM_PROVIDER_MODELS.get(self.provider, "llama3.2")

        # Load config file overrides
        cfg = _load_config()
        if cfg.get("provider") and not provider:
            self.provider = cfg["provider"].lower()
        if cfg.get("model") and not model:
            self.model = cfg["model"]
        if cfg.get("api_key") and not api_key:
            api_key = cfg["api_key"]

        self.api_key = api_key or os.environ.get(f"{self.provider.upper()}_API_KEY")

    def chat(self, messages: list[dict], max_tokens: int = 4096) -> Optional[str]:
        if self.provider == "openai":
            return self._chat_openai(messages, max_tokens)
        elif self.provider == "anthropic":
            return self._chat_anthropic(messages, max_tokens)
        elif self.provider == "ollama":
            return self._chat_ollama(messages, max_tokens)
        else:
            logger.error(f"unknown LLM provider: {self.provider}")
            return None

    def _chat_openai(self, messages: list[dict], max_tokens: int) -> Optional[str]:
        try:
            from openai import OpenAI
            client = OpenAI(api_key=self.api_key)
            r = client.chat.completions.create(
                model=self.model, messages=messages, max_tokens=max_tokens,
            )
            if r.choices and len(r.choices) > 0:
                return r.choices[0].message.content
            print("  [error] OpenAI returned empty choices")
            return None
        except ImportError:
            print("  [error] openai package not installed: pip install openai")
            return None
        except Exception as e:
            print(f"  [error] OpenAI: {e}")
            return None

    def _chat_anthropic(self, messages: list[dict], max_tokens: int) -> Optional[str]:
        try:
            from anthropic import Anthropic
            client = Anthropic(api_key=self.api_key)
            sys_msg = None
            msgs = []
            for m in messages:
                if m["role"] == "system":
                    sys_msg = m["content"]
                else:
                    msgs.append({"role": m["role"], "content": m["content"]})
            kwargs = dict(model=self.model, max_tokens=max_tokens, messages=msgs)
            if sys_msg:
                kwargs["system"] = sys_msg
            r = client.messages.create(**kwargs)
            if r.content and len(r.content) > 0:
                block = r.content[0]
                text = getattr(block, "text", None)
                if isinstance(text, str):
                    return text
            print("  [error] Anthropic returned empty or non-text content")
            return None
        except ImportError:
            print("  [error] anthropic package not installed: pip install anthropic")
            return None
        except Exception as e:
            print(f"  [error] Anthropic: {e}")
            return None

    def _chat_ollama(self, messages: list[dict], max_tokens: int) -> Optional[str]:
        import urllib.request
        import urllib.error
        # OLLAMA_API_BASE lets this point at a remote/networked Ollama
        # server (e.g. a Tailscale-reachable box) instead of only ever
        # talking to localhost -- same env var name Ollama's own official
        # clients use, so it's consistent with any existing setup.
        base = os.environ.get("OLLAMA_API_BASE", "http://localhost:11434").rstrip("/")
        # Reasoning/"thinking" models (e.g. openbmb/minicpm5, Qwen3-family --
        # confirmed via `ollama list`'s "family":"qwen35" tag on at least one
        # real Ollama server this pipeline talks to) spend a large, unbounded
        # chunk of the token budget on an internal <thinking> trace before
        # emitting any real "content". Confirmed directly, same model/prompt:
        # with thinking on, a trivial "what is 2+2" call took ~38s (and a
        # real consolidation prompt exceeded a 300s budget without ever
        # finishing); with `"think": false`, the same trivial call took
        # ~5s. Structured JSON extraction against an explicit schema is
        # exactly the kind of task that doesn't benefit from chain-of-thought
        # -- bumping the timeout further would have papered over the real
        # problem (wasted reasoning tokens) rather than fixing it. Ollama
        # ignores unknown request fields, so this is safe to send even to
        # models that don't support toggling thinking at all.
        #
        # Eliminating wasted thinking tokens wasn't the whole story, though:
        # even with think=false, this same real consolidation prompt against
        # the same model measured ~104s of raw generation for a 218-token
        # response on at least one real (CPU-bound, Tailscale-reachable)
        # Ollama box -- ~2 tokens/sec, genuinely slow hardware, not a prompt
        # problem. 120s cut that off right at the margin. Default reflects
        # that observed reality with headroom, not a guess.
        timeout = int(os.environ.get("OLLAMA_TIMEOUT", "180"))
        body = json.dumps({"model": self.model, "messages": messages, "stream": False,
                           "think": False,
                           "options": {"num_predict": max_tokens}}).encode()
        try:
            req = urllib.request.Request(f"{base}/api/chat", data=body,
                                         headers={"Content-Type": "application/json"})
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                data = json.loads(resp.read())
                msg = data.get("message") or {}
                return msg.get("content")
        except urllib.error.URLError:
            print(f"  [error] Ollama not running at {base}")
            print("  Start it: ollama serve")
            return None
        except Exception as e:
            print(f"  [error] Ollama: {e}")
            return None


# ── LLM Prompts ────────────────────────────────


LLM_CONSOLIDATE_SYSTEM = """You are a resume data extraction expert. Given the raw text extracted from one or more CV, resume, and LinkedIn profile files for a person, produce a structured JSON summary optimized for 2026 tech resume standards (AI engineering, Cloud Native, Rust, TypeScript).

Extract ALL of the following fields if present:

{
  "name": "Full Name",
  "contact": {"email": "", "phone": "", "location": "", "linkedin": "", "website": ""},
  "titles": ["most common professional titles found"],
  "summary": "2-3 sentence professional summary synthesizing their role, seniority, and specializations",
  "skills": {
    "languages": [],
    "frameworks": [],
    "cloud_devops": [],
    "databases": [],
    "tools": []
  },
  "experience": [
    {
      "title": "Job Title",
      "company": "Company",
      "start": "Date",
      "end": "Date",
      "location": "",
      "bullets": ["focus on quantifiable engineering metrics %, scale, and STE-100 action verbs"]
    }
  ],
  "education": [{"degree": "", "school": "", "years": ""}],
  "certifications": [],
  "languages_spoken": []
}

Important rules:
- For experience bullets, prioritize quantifiable engineering metrics %, scale, and STE-100 action verbs. Emphasize AI engineering, Cloud Native, Rust, and TypeScript achievements where applicable.
- Be thorough: cross-reference all provided files and merge information. More recent files take priority for role details.
- Deduplicate: if the same role appears in multiple files, merge the best details.
- Be compact: 2-4 bullets per role max, each 10-20 words.
- If a field is not found in any file, output null or an empty array — do not fabricate."""

LLM_RESUME_SYSTEM = """You are a resume writer. Given structured JSON data about a person's career, produce a compact, tech-focused markdown resume.

Style rules:
- Compact and direct — NOT verbose or "forewordy"
- 1-line summary, not a paragraph
- Experience bullets focus on: tech stack, architecture, what they built, scale, ownership
- NO fluffy business metrics ("increased revenue", "reduced costs by X%")
- NO full sentences that start with "Responsible for" or "Led the" — use strong action verbs: "Built", "Architected", "Designed", "Implemented", "Developed"
- 2-4 bullets per role, each 10-20 words
- Skills section as a single comma-separated line
- Education and certs as minimal lines

Output format:
# Name
**Title** | Location · email · linkedin

## Summary
1-line technical identity.

## Skills
Languages: ... | Cloud: ... | Databases: ... | Tools: ...

## Experience
### Title — Company
*Mon YYYY – Mon YYYY | Location*
- Action-focused bullet about tech and architecture
- ...

## Education
**Degree** — School *(years)*

## Certifications
- Cert name"""


def _validate_structured_data(data: dict) -> bool:
    """Check that consolidated JSON has the minimum required fields."""
    if "_raw" in data:
        return False
    has_required = REQUIRED_STRUCTURED_KEYS.intersection(data.keys())
    if len(has_required) < 2:
        return False
    return True


def llm_consolidate(client: LLMClient, bundle: PersonBundle) -> Optional[dict]:
    """Send extracted texts to LLM and get structured JSON."""
    combined = []
    for fname, text in sorted(bundle.extracted_texts.items()):
        combined.append(f"--- {fname} ---\n{text.strip()[:TEXT_TRUNCATION_LENGTH]}")
    payload = "\n\n".join(combined)

    messages = [
        {"role": "system", "content": LLM_CONSOLIDATE_SYSTEM},
        {"role": "user", "content": f"Extract structured data from these CV files for {bundle.name}:\n\n{payload}"},
    ]

    print(f"  [llm] sending {len(payload)} chars to {client.provider}/{client.model}...")
    result = client.chat(messages, max_tokens=DEFAULT_MAX_TOKENS_CONSOLIDATION)
    if not result:
        return None

    # Try to extract JSON from response
    json_match = re.search(r"```(?:json)?\s*([\s\S]*?)```", result)
    text = json_match.group(1) if json_match else result
    try:
        parsed = json.loads(text)
        if isinstance(parsed, dict) and _validate_structured_data(parsed):
            return parsed
        if not isinstance(parsed, dict):
            print(f"  [warn] LLM returned valid JSON but not an object ({type(parsed).__name__}), saving raw response")
        else:
            print(f"  [warn] LLM response missing required fields (needs at least 2 of: {', '.join(sorted(REQUIRED_STRUCTURED_KEYS))})")
        return {"_raw": result}
    except json.JSONDecodeError:
        print(f"  [warn] LLM returned non-JSON, saving raw response")
        return {"_raw": result}


def llm_generate_resume(client: LLMClient, name: str, data: dict) -> Optional[str]:
    """Send structured data to LLM and get a markdown resume."""
    messages = [
        {"role": "system", "content": LLM_RESUME_SYSTEM},
        {"role": "user", "content": f"Generate a compact resume from this data:\n\n{json.dumps(data, indent=2)}"},
    ]
    print(f"  [llm] generating resume for {name}...")
    return client.chat(messages, max_tokens=DEFAULT_MAX_TOKENS_RESUME)


LLM_JOB_MATCH_SYSTEM = """You are a professional technical recruiter and career coach.
Given a candidate's structured resume JSON profile and a target Job Description, perform a deep alignment analysis.
Produce a structured JSON response with these exact keys:
- "matchScore": an integer from 0 to 100 representing how well the candidate's skills and experience align with the job description.
- "matchedKeywords": a list of keywords/skills/technologies mentioned in both the resume and the job description.
- "missingKeywords": a list of key skills, technologies, or concepts requested in the job description that are missing from the resume.
- "gapAnalysis": a paragraph summarizing the main experience or tech stack gaps.
- "tailoredBullets": a list of specific action points or suggestions on how the candidate can modify their experience bullet points to better match this job description.

Response MUST contain only the JSON block (and optionally wrapped in ```json ... ```).
"""

def llm_match_job(client: LLMClient, profile_data: dict, job_desc: str) -> Optional[dict]:
    """Compare structured profile data with target job description using LLM."""
    messages = [
        {"role": "system", "content": LLM_JOB_MATCH_SYSTEM},
        {"role": "user", "content": f"Candidate Profile JSON:\n{json.dumps(profile_data, indent=2)}\n\nTarget Job Description:\n{job_desc}"},
    ]
    print(f"  [llm] matching job description...")
    result = client.chat(messages, max_tokens=DEFAULT_MAX_TOKENS_JOB_MATCH)
    if not result:
        return None

    # Try to extract JSON from response
    json_match = re.search(r"```(?:json)?\s*([\s\S]*?)```", result)
    text = json_match.group(1) if json_match else result
    try:
        parsed = json.loads(text)
        return parsed
    except json.JSONDecodeError:
        print(f"  [warn] LLM returned non-JSON for job match: {result[:200]}...")
        return {
            "matchScore": 50,
            "matchedKeywords": [],
            "missingKeywords": [],
            "gapAnalysis": "Failed to parse LLM analysis response as valid JSON.",
            "tailoredBullets": [f"Raw output: {result}"]
        }


# ── Consolidate & Resume (LLM-powered) ──────────


def llm_process_all(bundles: dict[str, PersonBundle], output_dir: str, client: LLMClient,
                    skip_consolidate: bool = False, skip_resume: bool = False,
                    resume_format: str = "markdown") -> None:
    consolidated_dir = os.path.join(output_dir, "consolidated")
    resume_dir = os.path.join(output_dir, "resumes")
    os.makedirs(consolidated_dir, exist_ok=True)
    os.makedirs(resume_dir, exist_ok=True)

    for person, bundle in bundles.items():
        if not bundle.extracted_texts:
            print(f"\n  [{slug(person)}] no extracted text, skipping LLM")
            continue

        if not skip_consolidate:
            print(f"\n--- LLM Consolidate: {person} ---")
            data = llm_consolidate(client, bundle)
            if data:
                path = os.path.join(consolidated_dir, f"{slug(person)}_structured.json")
                with open(path, "w") as f:
                    json.dump(data, f, indent=2)
                print(f"  → {path}")
            else:
                data = {}
        else:
            # Load previously saved JSON
            path = os.path.join(consolidated_dir, f"{slug(person)}_structured.json")
            if os.path.exists(path):
                with open(path) as f: data = json.load(f)
            else:
                print(f"  [{slug(person)}] no cached structured data, skipping resume")
                continue

        if not skip_resume and data:
            print(f"\n--- LLM Resume: {person} ---")
            resume_text = llm_generate_resume(client, person, data)
            if resume_text:
                rpath = os.path.join(resume_dir, f"{slug(person)}_resume.md")
                with open(rpath, "w") as f:
                    f.write(resume_text)
                print(f"  → {rpath}")

            if resume_format == "latex":
                latex_dir = os.path.join(output_dir, "latex")
                os.makedirs(latex_dir, exist_ok=True)
                tex_content = latex.render_latex(data, person)
                tex_path = os.path.join(latex_dir, f"{slug(person)}_resume.tex")
                with open(tex_path, "w") as f:
                    f.write(tex_content)
                print(f"  → {tex_path}")
                pdf_path = latex.compile_pdf(tex_path, latex_dir)
                if pdf_path:
                    print(f"  → {pdf_path}")


# ── Data Quality ───────────────────────────────


SKILL_CATEGORIES = ("languages", "frameworks", "cloud_devops", "databases", "tools")


def score_structured_data(data: dict) -> dict:
    """Score a consolidated structured-JSON record for completeness.

    Returns {"score": int, "max_score": int, "warnings": [...], "critical": bool}.
    ``critical`` is True iff the record fails REQUIRED_STRUCTURED_KEYS (name/skills/
    experience missing or empty) or is raw/unparsed LLM output — i.e. unusable as a
    resume source. All other checks only add warnings and reduce the score.
    """
    warnings: list[str] = []
    score = 0
    max_score = 0
    critical = False

    if not isinstance(data, dict):
        return {"score": 0, "max_score": 0, "warnings": ["data is not a JSON object"], "critical": True}

    if "_raw" in data:
        critical = True
        warnings.append("data is raw/unparsed LLM output (structured extraction failed)")

    for key in sorted(REQUIRED_STRUCTURED_KEYS):
        max_score += 1
        if data.get(key):
            score += 1
        else:
            critical = True
            warnings.append(f"missing required field: {key}")

    contact = data.get("contact")
    contact = contact if isinstance(contact, dict) else {}
    for field_name in ("email", "phone", "location"):
        max_score += 1
        if contact.get(field_name):
            score += 1
        else:
            warnings.append(f"no contact {field_name}")

    max_score += 1
    if data.get("summary"):
        score += 1
    else:
        warnings.append("no professional summary")

    max_score += 1
    if data.get("titles"):
        score += 1
    else:
        warnings.append("no titles listed")

    skills = data.get("skills")
    if isinstance(skills, dict):
        for cat in SKILL_CATEGORIES:
            max_score += 1
            if skills.get(cat):
                score += 1
            else:
                warnings.append(f"skills.{cat} is empty")
    else:
        max_score += len(SKILL_CATEGORIES)
        warnings.append("skills is missing or not an object")

    experience = data.get("experience")
    if isinstance(experience, list):
        for i, entry in enumerate(experience, start=1):
            if not isinstance(entry, dict):
                warnings.append(f"experience entry {i} is not a valid object")
                continue
            label = entry.get("title") or entry.get("company") or f"entry {i}"
            max_score += 1
            if entry.get("title") and entry.get("company"):
                score += 1
            else:
                warnings.append(f"experience entry {i} ({label}) missing title/company")
            max_score += 1
            if entry.get("bullets"):
                score += 1
            else:
                warnings.append(f"experience entry {i} ({label}) missing bullets")

    for optional_key, label in (("education", "education"), ("certifications", "certifications"),
                                 ("languages_spoken", "spoken languages")):
        max_score += 1
        if data.get(optional_key):
            score += 1
        else:
            warnings.append(f"no {label} listed")

    # ASD-STE100 Issue 9 Compliance checks
    summary_text = data.get("summary")
    if summary_text and isinstance(summary_text, str):
        summary_warns = ste100.validate_text_ste100(summary_text, is_procedural=False)
        for w in summary_warns:
            warnings.append(f"STE-100 (Summary): {w}")

    if isinstance(experience, list):
        for i, entry in enumerate(experience, start=1):
            if isinstance(entry, dict) and entry.get("bullets"):
                label = entry.get("title") or entry.get("company") or f"entry {i}"
                for bullet in entry.get("bullets", []):
                    if isinstance(bullet, str):
                        bullet_warns = ste100.validate_text_ste100(bullet, is_procedural=False)
                        for w in bullet_warns:
                            warnings.append(f"STE-100 ({label}): {w}")

    return {"score": score, "max_score": max_score, "warnings": warnings, "critical": critical}


def _find_structured_json_files(path: str) -> list[str]:
    """Locate *_structured.json files to validate, given a file or a directory.

    If *path* is a directory, prefer a `consolidated/` subdirectory (the standard
    pipeline output layout); otherwise scan *path* itself.
    """
    if os.path.isfile(path):
        return [path]
    consolidated_dir = os.path.join(path, "consolidated")
    search_dir = consolidated_dir if os.path.isdir(consolidated_dir) else path
    if not os.path.isdir(search_dir):
        return []
    return [
        os.path.join(search_dir, fname)
        for fname in sorted(os.listdir(search_dir))
        if fname.endswith("_structured.json")
    ]


def validate_command(path: str) -> int:
    """Run the data-quality gate over one JSON file or a directory of them.

    Prints a human-readable per-person report and returns a process exit code:
    0 if every file passes REQUIRED_STRUCTURED_KEYS, 1 if any file is critically
    incomplete (or couldn't be read at all) — suitable for use as a CI gate.
    """
    files = _find_structured_json_files(path)
    if not files:
        print(f"  [error] no *_structured.json files found at: {path}")
        return 1

    print("\n=== Data Quality Report ===")
    exit_code = 0
    for fpath in files:
        name = os.path.basename(fpath)
        if name.endswith("_structured.json"):
            name = name[: -len("_structured.json")]
        try:
            with open(fpath) as f:
                data = json.load(f)
        except (json.JSONDecodeError, OSError) as e:
            print(f"\n  [{name}] [error] could not read/parse {fpath}: {e}")
            exit_code = 1
            continue

        result = score_structured_data(data)
        status = "CRITICAL" if result["critical"] else "OK"
        print(f"\n  [{name}] score: {result['score']}/{result['max_score']}  status: {status}")
        for w in result["warnings"]:
            print(f"    - {w}")
        if result["critical"]:
            exit_code = 1

    print()
    return exit_code


def match_job_command(profile_path: str, job_desc_path: str, client: LLMClient) -> int:
    """Compare structured profile data with target job description and print JSON analysis."""
    if not os.path.exists(profile_path):
        print(f"  [error] profile file not found: {profile_path}")
        return 1
    if not os.path.exists(job_desc_path):
        print(f"  [error] job description file not found: {job_desc_path}")
        return 1

    try:
        with open(profile_path) as f:
            profile_data = json.load(f)
    except Exception as e:
        print(f"  [error] failed to read profile JSON: {e}")
        return 1

    try:
        with open(job_desc_path) as f:
            job_desc = f.read()
    except Exception as e:
        print(f"  [error] failed to read job description: {e}")
        return 1

    result = llm_match_job(client, profile_data, job_desc)
    if result:
        print(json.dumps(result, indent=2))
        return 0
    return 1


# ── Rescore / Redetect / Stats ──────────────────


def rescore_command(output_dir: str, llm_client: LLMClient, person: Optional[str] = None,
                    skip_consolidate: bool = False, skip_resume: bool = False,
                    resume_format: str = "markdown") -> int:
    """Re-run LLM consolidation/resume generation against files already organized
    under output_dir/resources/, without re-scanning source directories. Useful for
    retrying with a different --llm/--model. Reuses extract_all + llm_process_all
    (which itself calls llm_consolidate + llm_generate_resume) exactly as `scan` does.
    """
    output_dir = os.path.abspath(output_dir)
    bundles = bundles_from_resources(output_dir, person_filter=person)
    if not bundles:
        if person:
            print(f"  [error] no organized files found for '{person}' under {output_dir}/resources")
        else:
            print(f"  [error] no organized files found under {output_dir}/resources")
        return 1

    print(f"  Found {len(bundles)} people under {output_dir}/resources")
    bundles = extract_all(bundles)
    llm_process_all(bundles, output_dir, llm_client, skip_consolidate=skip_consolidate,
                    skip_resume=skip_resume, resume_format=resume_format)
    return 0


def redetect_command(output_dir: str, apply: bool = False) -> int:
    """Re-run extract_person() against filenames already organized under
    output_dir/resources/ (e.g. after the user edits aliases.json) and report what
    would change. Dry-run by default — only prints old-slug -> new-slug diffs; pass
    apply=True to actually move the files.
    """
    output_dir = os.path.abspath(output_dir)
    resources_dir = os.path.join(output_dir, "resources")
    if not os.path.isdir(resources_dir):
        print(f"  [error] no resources/ directory found under {output_dir}")
        return 1

    changes = []  # (old_dir_slug, new_dir_slug, filename)
    for dirname in sorted(os.listdir(resources_dir)):
        person_dir = os.path.join(resources_dir, dirname)
        if not os.path.isdir(person_dir):
            continue
        for fname in sorted(os.listdir(person_dir)):
            if not os.path.isfile(os.path.join(person_dir, fname)):
                continue
            ext = os.path.splitext(fname)[1].lower()
            if ext not in VALID_EXT or not is_cv_related(fname):
                continue  # skip stray non-CV files (.DS_Store, README.md, ...) — same gate as scan_directories
            detected = extract_person(fname)
            new_slug = slug(detected) if detected else dirname
            if new_slug != dirname:
                changes.append((dirname, new_slug, fname))

    print(f"\n=== Redetect {'(applying)' if apply else '(dry run)'}: {output_dir} ===")
    if not changes:
        print("  no changes — all files already match current detection rules")
        return 0

    for old_slug, new_slug, fname in changes:
        print(f"  [{fname}] {old_slug} → {new_slug}")

    if apply:
        for old_slug, new_slug, fname in changes:
            src = os.path.join(resources_dir, old_slug, fname)
            new_dir = os.path.join(resources_dir, new_slug)
            os.makedirs(new_dir, exist_ok=True)
            dest = _unique_dest(new_dir, fname)
            shutil.move(src, dest)
        # Prune person dirs left empty by the move.
        for dirname in sorted(os.listdir(resources_dir)):
            person_dir = os.path.join(resources_dir, dirname)
            if os.path.isdir(person_dir) and not os.listdir(person_dir):
                os.rmdir(person_dir)
        print(f"\n  moved {len(changes)} file(s)")
    else:
        print(f"\n  {len(changes)} file(s) would move — pass --apply to move them")

    return 0


def stats_command(output_dir: str) -> int:
    """Print a summary of an existing output directory: how many people, how many
    files each, whether structured JSON / resumes / latex exist per person, and
    (reusing score_structured_data) any data-quality warnings.
    """
    output_dir = os.path.abspath(output_dir)
    resources_dir = os.path.join(output_dir, "resources")
    consolidated_dir = os.path.join(output_dir, "consolidated")
    resumes_dir = os.path.join(output_dir, "resumes")
    latex_dir = os.path.join(output_dir, "latex")

    if not os.path.isdir(resources_dir):
        print(f"  [error] no resources/ directory found under {output_dir}")
        return 1

    people = sorted(d for d in os.listdir(resources_dir) if os.path.isdir(os.path.join(resources_dir, d)))
    print(f"\n=== Stats: {output_dir} ===")
    if not people:
        print("  no people found under resources/")
        return 0

    print(f"  People: {len(people)}")
    total_files = 0
    for p in people:
        person_dir = os.path.join(resources_dir, p)
        files = [f for f in os.listdir(person_dir) if os.path.isfile(os.path.join(person_dir, f))]
        total_files += len(files)

        json_path = os.path.join(consolidated_dir, f"{p}_structured.json")
        md_path = os.path.join(resumes_dir, f"{p}_resume.md")
        tex_path = os.path.join(latex_dir, f"{p}_resume.tex")
        has_json = os.path.isfile(json_path)

        print(f"\n  [{p}] {len(files)} file(s)")
        print(f"    structured json: {'yes' if has_json else 'no'}")
        print(f"    resume markdown: {'yes' if os.path.isfile(md_path) else 'no'}")
        print(f"    latex:           {'yes' if os.path.isfile(tex_path) else 'no'}")

        if has_json:
            try:
                with open(json_path) as f:
                    data = json.load(f)
            except (json.JSONDecodeError, OSError) as e:
                print(f"    quality: [error] could not read {json_path}: {e}")
                continue
            result = score_structured_data(data)
            status = "CRITICAL" if result["critical"] else "OK"
            print(f"    quality: {result['score']}/{result['max_score']} ({status})")
            for w in result["warnings"]:
                print(f"      - {w}")

    print(f"\n  Total files: {total_files}\n")
    return 0


# ── Summary ────────────────────────────────────


def summary_report(bundles: dict[str, PersonBundle], output_dir: str, elapsed: float) -> None:
    report = [f"# Pipeline Summary", f"Ran: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
              f"Duration: {elapsed:.1f}s", "", f"**People found:** {len(bundles)}",
              f"**Total files:** {sum(len(b.files) for b in bundles.values())}", ""]
    for person, bundle in sorted(bundles.items()):
        cats = defaultdict(list)
        for f in bundle.files: cats[f.category].append(f.filename)
        parts = ", ".join(f"{k} {len(v)}" for k, v in sorted(cats.items()))
        report.append(f"- **{person}** ({len(bundle.files)} files): {parts}")
    report += ["", "## Output", f"```",
               f"{output_dir}/",
               f"├── resources/{{person}}/    # sorted source files",
               f"├── consolidated/            # structured JSON + raw text",
               f"└── resumes/                 # LLM-generated markdown resumes",
               f"```"]
    rpath = os.path.join(output_dir, "README.md")
    with open(rpath, "w") as f: f.write("\n".join(report))
    print(f"\n  [summary] → {rpath}")


# ── Main ───────────────────────────────────────


def consolidate_files(paths: list[str], llm_client: LLMClient) -> dict:
    """Consolidate one or more already-saved file paths for a single person.
    Returns ``{"profile": <dict>, "score": <dict>, "pdf_path": <str-or-null>,
    "tmp_dir": <str>}``.

    The single source of truth for "given some files on disk, produce a
    structured profile + quality score + rendered LaTeX/PDF" -- reused by
    both consolidate_stdin_command() (the CLI/subprocess bridge the web
    upload route used to call directly) and worker.py (which imports this
    module and calls this function in-process, no subprocess involved,
    since it's already a long-lived Python process). Keeping this as one
    function means a fix here fixes both callers at once.

    Every step below normally prints progress straight to stdout -- that's
    redirected to stderr for the duration of this call so callers that
    parse stdout (consolidate_stdin_command's JSON line) or want clean logs
    (worker.py) both get that for free.

    tmp_dir must survive past this function returning (a caller reading
    pdf_path off disk may do so well after this returns, e.g.
    consolidate_stdin_command's subprocess caller reads it only after the
    whole process exits), so it is NOT cleaned up here -- always returned,
    even when pdf_path is null, so every caller can unconditionally remove
    it once it's actually done reading from it.
    """
    with contextlib.redirect_stdout(sys.stderr):
        display_name = (paths and extract_person(os.path.basename(paths[0]))) or "Candidate"

        bundle = PersonBundle(name=display_name)
        for path in paths:
            filename = os.path.basename(path)
            bundle.files.append(FoundFile(
                path=path, filename=filename, ext=os.path.splitext(filename)[1].lower(),
                size_kb=fmt_size(path), person=display_name, category=classify(filename),
            ))
            text = extract_text(path)
            if text:
                bundle.extracted_texts[filename] = text

        data = None
        # 1. Primary: On-device structured extraction using Needle 2
        if NEEDLE_AVAILABLE and bundle.extracted_texts:
            try:
                combined = "\n\n".join(bundle.extracted_texts.values())
                needle_extractor = NeedleExtractor()
                needle_res = needle_extractor.extract_full_profile(combined)
                if needle_res.success and needle_res.profile and (needle_res.profile.get("experience") or needle_res.profile.get("skills")):
                    data = needle_res.profile
                    print(f"  [needle] extracted profile on-device in {needle_res.elapsed_ms:.1f}ms")
            except Exception as e:
                logger.debug(f"Needle extraction exception: {e}")

        # 2. Fallback to LLM consolidation if Needle extraction wasn't available or empty
        if not data and bundle.extracted_texts and llm_client:
            data = llm_consolidate(llm_client, bundle)

        profile = data if isinstance(data, dict) else {"_raw": "no extractable text or empty LLM response"}

        score = score_structured_data(profile)

        tmp_dir = tempfile.mkdtemp(prefix="cv-consolidate-")
        tex_path = os.path.join(tmp_dir, f"{slug(display_name)}_resume.tex")
        with open(tex_path, "w") as f:
            f.write(latex.render_latex(profile, display_name))
        pdf_path = latex.compile_pdf(tex_path, tmp_dir)

    return {"profile": profile, "score": score, "pdf_path": pdf_path, "tmp_dir": tmp_dir}


def consolidate_stdin_command(paths: list[str], llm_client: LLMClient) -> int:
    """CLI/subprocess bridge: consolidate_files(), then print EXACTLY one
    line of JSON to stdout so a caller in another process/language (the
    Next.js web layer, historically) can parse it. See consolidate_files()
    for the actual work."""
    result = consolidate_files(paths, llm_client)
    print(json.dumps(result))
    return 0


def run(search_dirs: list[str], output_dir: str, dry_run: bool = False,
        extract: bool = True, llm_enabled: bool = False,
        llm_client: Optional[LLMClient] = None,
        skip_consolidate: bool = False, skip_resume: bool = False,
        resume_format: str = "markdown") -> None:
    t0 = time.time()
    os.makedirs(output_dir, exist_ok=True)
    print(f"Output: {output_dir}")
    print(f"Search: {search_dirs}")

    print("\n=== STEP 1: Scanning ===")
    bundles = scan_directories(search_dirs)
    if not bundles: print("  No CV/resume files found."); return
    print(f"  Found {len(bundles)} people, {sum(len(b.files) for b in bundles.values())} files")

    print("\n=== STEP 2: Organizing ===")
    organize_files(bundles, output_dir, dry_run)
    if dry_run: print("\n[Dry run complete]"); return

    if extract:
        bundles = extract_all(bundles)

    if llm_enabled and llm_client:
        print("\n=== STEP 3: LLM Processing ===")
        llm_process_all(bundles, output_dir, llm_client, skip_consolidate, skip_resume,
                        resume_format=resume_format)
    elif extract:
        # Fallback: hard-coded raw text dump
        print("\n=== STEP 3: Saving Raw Extracts ===")
        consolidated_dir = os.path.join(output_dir, "consolidated")
        os.makedirs(consolidated_dir, exist_ok=True)
        for person, bundle in bundles.items():
            if not bundle.extracted_texts: continue
            lines = [f"# {person}", f"Auto-extracted {datetime.now().strftime('%Y-%m-%d')}", ""]
            for fname, text in sorted(bundle.extracted_texts.items()):
                lines.append(f"## {fname}\n```\n{text.strip()[:10000]}\n```\n")
            path = os.path.join(consolidated_dir, f"{slug(person)}_extracted.md")
            with open(path, "w") as f: f.write("\n".join(lines))
            print(f"  [{slug(person)}] → {path}")

    summary_report(bundles, output_dir, time.time() - t0)
    print(f"\n✓ Done in {time.time() - t0:.1f}s")


def main():
    parser = argparse.ArgumentParser(
        description="CV/Resume consolidation pipeline (LLM-powered)",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python pipeline.py scan --auto                              # scan + no LLM
  python pipeline.py scan --auto --llm ollama                 # scan + local LLM
  python pipeline.py scan ~/Downloads --llm openai --model gpt-4o
  python pipeline.py scan ~/Downloads --llm anthropic
  python pipeline.py scan --auto --dry-run                    # preview only
  python pipeline.py scan --auto --llm openai --skip-resume   # structured data only
  python pipeline.py validate ./cv_pipeline_output            # data-quality gate (CI-friendly)
  python pipeline.py validate ./cv_pipeline_output/consolidated/john-doe_structured.json
  python pipeline.py rescore --output ./cv_pipeline_output --llm anthropic     # redo LLM step
  python pipeline.py rescore --output ./cv_pipeline_output "Jane Doe" --llm openai --model gpt-4o
  python pipeline.py redetect --output ./cv_pipeline_output                   # preview renames
  python pipeline.py redetect --output ./cv_pipeline_output --apply          # apply them
  python pipeline.py stats --output ./cv_pipeline_output                     # summarize output dir
  python pipeline.py consolidate-stdin file1.pdf file2.txt --llm anthropic   # web-layer bridge: one JSON line on stdout
        """)
    sub = parser.add_subparsers(dest="command", required=True)

    scan = sub.add_parser("scan", help="Scan and process CV files")
    scan.add_argument("dirs", nargs="*", default=None)
    scan.add_argument("--auto", action="store_true", help="Auto-detect Downloads/Desktop/Documents")
    scan.add_argument("--output", "-o", default="./cv_pipeline_output")
    scan.add_argument("--dry-run", action="store_true")
    scan.add_argument("--no-extract", action="store_true")
    scan.add_argument("--llm", default=None, choices=["openai", "anthropic", "ollama"],
                      help="Enable LLM processing with the given provider")
    scan.add_argument("--model", default=None, help="LLM model override (e.g. gpt-4o, claude-3-opus)")
    scan.add_argument("--skip-consolidate", action="store_true", help="Skip LLM consolidation, use cached JSON")
    scan.add_argument("--skip-resume", action="store_true", help="Skip LLM resume generation")
    scan.add_argument("--format", default="markdown", choices=["markdown", "latex"],
                      help="Resume output format. 'latex' additionally renders a .tex file "
                           "(and attempts PDF compilation) from the structured JSON into latex/")
    scan.add_argument("--set-key", nargs=2, metavar=("PROVIDER", "API_KEY"),
                      help="Save an API key to config and exit")

    validate = sub.add_parser("validate", help="Data-quality gate: score consolidated structured JSON for completeness")
    validate.add_argument("path", help="Path to a *_structured.json file, or a directory containing "
                                        "consolidated/*_structured.json files")

    rescore = sub.add_parser("rescore", help="Re-run LLM consolidation/resume generation against an "
                                              "already-organized output dir, without re-scanning source dirs")
    rescore.add_argument("person", nargs="?", default=None,
                         help="Only rescore this person (display name or slug). Default: everyone.")
    rescore.add_argument("--output", "-o", default="./cv_pipeline_output",
                         help="Existing output dir with a resources/ folder to rescore")
    rescore.add_argument("--llm", default=None, choices=["openai", "anthropic", "ollama"],
                         help="LLM provider to use (required)")
    rescore.add_argument("--model", default=None, help="LLM model override (e.g. gpt-4o, claude-3-opus)")
    rescore.add_argument("--skip-consolidate", action="store_true", help="Skip LLM consolidation, use cached JSON")
    rescore.add_argument("--skip-resume", action="store_true", help="Skip LLM resume generation")
    rescore.add_argument("--format", default="markdown", choices=["markdown", "latex"],
                         help="Resume output format, same as `scan --format`")

    redetect = sub.add_parser("redetect", help="Re-run person detection against filenames already organized "
                                               "under an output dir's resources/ folder (e.g. after editing "
                                               "aliases.json) and report what would change")
    redetect.add_argument("--output", "-o", default="./cv_pipeline_output",
                          help="Existing output dir with a resources/ folder to redetect")
    redetect.add_argument("--apply", action="store_true",
                          help="Actually move/rename files. Default is a dry run that only prints diffs.")

    stats = sub.add_parser("stats", help="Summarize an existing output dir: people, file counts, "
                                         "which artifacts exist, and data-quality warnings")
    stats.add_argument("--output", "-o", default="./cv_pipeline_output",
                       help="Existing output dir to summarize")

    consolidate_stdin = sub.add_parser(
        "consolidate-stdin",
        help="Consolidate already-saved file paths for one person and print a single "
             "JSON line to stdout (the bridge the web layer calls into)")
    consolidate_stdin.add_argument("paths", nargs="+", help="Paths to files already saved to disk")
    consolidate_stdin.add_argument("--llm", required=True, choices=["openai", "anthropic", "ollama"],
                                   help="LLM provider to use (required)")
    consolidate_stdin.add_argument("--model", default=None,
                                   help="LLM model override (e.g. gpt-4o, claude-3-opus)")

    match_job = sub.add_parser(
        "match-job",
        help="Compare structured profile data with target job description and output analysis JSON")
    match_job.add_argument("--profile", required=True, help="Path to consolidated structured JSON profile")
    match_job.add_argument("--job-desc", required=True, help="Path to plain text job description file")
    match_job.add_argument("--llm", required=True, choices=["openai", "anthropic", "ollama"],
                           help="LLM provider to use (required)")
    match_job.add_argument("--model", default=None,
                           help="LLM model override (e.g. gpt-4o, claude-3-opus)")

    args = parser.parse_args()

    if args.command == "validate":
        sys.exit(validate_command(args.path))

    if args.command == "rescore":
        if not args.llm:
            parser.error("rescore requires --llm {openai,anthropic,ollama}")
        llm_client = LLMClient(provider=args.llm, model=args.model)
        sys.exit(rescore_command(args.output, llm_client, person=args.person,
                                 skip_consolidate=args.skip_consolidate, skip_resume=args.skip_resume,
                                 resume_format=args.format))

    if args.command == "redetect":
        sys.exit(redetect_command(args.output, apply=args.apply))

    if args.command == "stats":
        sys.exit(stats_command(args.output))

    if args.command == "consolidate-stdin":
        llm_client = LLMClient(provider=args.llm, model=args.model)
        sys.exit(consolidate_stdin_command(args.paths, llm_client))

    if args.command == "match-job":
        llm_client = LLMClient(provider=args.llm, model=args.model)
        sys.exit(match_job_command(args.profile, args.job_desc, llm_client))

    if args.set_key:
        provider, key = args.set_key
        _write_config({"provider": provider, "api_key": key})
        print(f"Saved {provider} API key to {CONFIG_PATH}")
        return

    dirs = args.dirs
    if not dirs:
        if args.auto: dirs = DEFAULT_SEARCH_DIRS
        else: parser.print_help(); sys.exit(1)

    llm_client = None
    llm_enabled = bool(args.llm)
    if llm_enabled:
        llm_client = LLMClient(provider=args.llm, model=args.model)

    run(search_dirs=dirs, output_dir=os.path.abspath(args.output),
        dry_run=args.dry_run, extract=not args.no_extract,
        llm_enabled=llm_enabled, llm_client=llm_client,
        skip_consolidate=args.skip_consolidate, skip_resume=args.skip_resume,
        resume_format=args.format)


if __name__ == "__main__":
    main()
