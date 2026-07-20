#!/usr/bin/env python3
"""
CV/Resume Consolidation Pipeline
=================================
Scans directories for CV/resume/LinkedIn PDFs, sorts by person, extracts text,
then uses an LLM to consolidate and generate compact tech-focused resumes.

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
import json
import os
import re
import shutil
import subprocess
import sys
import time
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Optional


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
    if re.search(r"(?i)\bcv\b", low): return "cv"
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
    m2 = re.search(r"(?i)(?:^|[/\\])(?:cv|resume|profile|linkedin)[_\-\s]+([a-z]+(?:[_\-\s][a-z]+)?)", cleaned)
    if m2:
        raw = m2.group(1).strip(" _-")
        raw = re.sub(r"\s+", " ", raw)
        aliased = _resolve_alias(raw.lower(), aliases)
        return aliased if aliased else _format_name(raw)

    # Fallback: extract before known suffixes
    parts = re.split(r"_+cv|_resume|_profile|linkedin|profile", cleaned, flags=re.I)
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
    try: return round(os.path.getsize(path) / 1024)
    except OSError: return 0


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
        b.files.sort(key=lambda f: (cat_order.get(f.category, 99), f.filename))
    return aliased

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
            if not dest.startswith(person_dir):
                print(f"  [warn] skipping malicious path: {ff.filename}")
                continue
            if os.path.exists(dest):
                base, ext = os.path.splitext(safe_name)
                candidate = os.path.join(person_dir, f"{base}_dup{ext}")
                counter = 2
                while os.path.exists(candidate):
                    candidate = os.path.join(person_dir, f"{base}_dup{counter}{ext}")
                    counter += 1
                dest = candidate
            if dry_run:
                print(f"  [copy] {safe_name} → {dest}")
            else:
                shutil.copy2(ff.path, dest)
        if not dry_run and bundle.files:
            cats = ", ".join(sorted(set(f.category for f in bundle.files)))
            print(f"  [{slug(person)}] {len(bundle.files)} files ({cats})")


# ── Text Extraction ────────────────────────────


def extract_text(filepath: str) -> Optional[str]:
    ext = os.path.splitext(filepath)[1].lower()
    if ext in SUPPORTED_EXTRACT_EXT:
        if ext == ".pdf":
            try:
                r = subprocess.run(["pdftotext", filepath, "-"], capture_output=True, text=True, timeout=30)
                if r.returncode == 0 and r.stdout.strip(): return r.stdout
            except (FileNotFoundError, subprocess.TimeoutExpired): pass
            try:
                import fitz
                doc = fitz.open(filepath)
                text = "\n".join(page.get_text() for page in doc)
                doc.close()
                if text.strip(): return text
            except ImportError: pass
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
            with open(CONFIG_PATH) as f: cfg = json.load(f)
        except (json.JSONDecodeError, OSError): pass
    return cfg.get("llm", {})

def _write_config(updates: dict):
    Path(CONFIG_PATH).parent.mkdir(parents=True, exist_ok=True)
    cfg = {}
    if os.path.exists(CONFIG_PATH):
        try:
            with open(CONFIG_PATH) as f: cfg = json.load(f)
        except: pass
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
            print(f"  [error] unknown LLM provider: {self.provider}")
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
        body = json.dumps({"model": self.model, "messages": messages, "stream": False,
                           "options": {"num_predict": max_tokens}}).encode()
        try:
            req = urllib.request.Request("http://localhost:11434/api/chat", data=body,
                                         headers={"Content-Type": "application/json"})
            with urllib.request.urlopen(req, timeout=120) as resp:
                data = json.loads(resp.read())
                return data.get("message", {}).get("content")
        except urllib.error.URLError:
            print("  [error] Ollama not running at http://localhost:11434")
            print("  Start it: ollama serve")
            return None
        except Exception as e:
            print(f"  [error] Ollama: {e}")
            return None


# ── LLM Prompts ────────────────────────────────


LLM_CONSOLIDATE_SYSTEM = """You are a resume data extraction expert. Given the raw text extracted from one or more CV, resume, and LinkedIn profile files for a person, produce a structured JSON summary.

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
      "bullets": ["focus on tech stack, architecture, and what they built, not fluffy metrics"]
    }
  ],
  "education": [{"degree": "", "school": "", "years": ""}],
  "certifications": [],
  "languages_spoken": []
}

Important rules:
- For experience bullets, emphasize technologies used, systems built, and architecture decisions. DO NOT include percentage-based metrics ("reduced costs by X%") or fluffy business impact claims unless they're verifiable technical achievements.
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
        combined.append(f"--- {fname} ---\n{text.strip()[:5000]}")
    payload = "\n\n".join(combined)

    messages = [
        {"role": "system", "content": LLM_CONSOLIDATE_SYSTEM},
        {"role": "user", "content": f"Extract structured data from these CV files for {bundle.name}:\n\n{payload}"},
    ]

    print(f"  [llm] sending {len(payload)} chars to {client.provider}/{client.model}...")
    result = client.chat(messages, max_tokens=4096)
    if not result:
        return None

    # Try to extract JSON from response
    json_match = re.search(r"```(?:json)?\s*([\s\S]*?)```", result)
    text = json_match.group(1) if json_match else result
    try:
        parsed = json.loads(text)
        if _validate_structured_data(parsed):
            return parsed
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
    return client.chat(messages, max_tokens=2048)


# ── Consolidate & Resume (LLM-powered) ──────────


def llm_process_all(bundles: dict[str, PersonBundle], output_dir: str, client: LLMClient,
                    skip_consolidate: bool = False, skip_resume: bool = False) -> None:
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


def run(search_dirs: list[str], output_dir: str, dry_run: bool = False,
        extract: bool = True, llm_enabled: bool = False,
        llm_client: Optional[LLMClient] = None,
        skip_consolidate: bool = False, skip_resume: bool = False) -> None:
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
        llm_process_all(bundles, output_dir, llm_client, skip_consolidate, skip_resume)
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
    scan.add_argument("--set-key", nargs=2, metavar=("PROVIDER", "API_KEY"),
                      help="Save an API key to config and exit")

    args = parser.parse_args()

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
        skip_consolidate=args.skip_consolidate, skip_resume=args.skip_resume)


if __name__ == "__main__":
    main()
