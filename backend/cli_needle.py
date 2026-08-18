#!/usr/bin/env python3
"""easyCV Needle 2 CLI Extraction & Benchmark Tool.

Tests Needle 2 structured resume extraction on raw text, PDF, Markdown, or text files.

Usage:
  uv run python backend/cli_needle.py <path_or_text>
  uv run python backend/cli_needle.py path/to/resume.pdf --benchmark
  cat resume.txt | uv run python backend/cli_needle.py - --json
"""

import argparse
import json
import os
import sys
import time
from typing import Optional

# Ensure repository root is on sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.needle_extractor import NeedleExtractor, NEEDLE_AVAILABLE


def extract_file_text(filepath: str) -> str:
    """Extract raw text from a PDF, Markdown, or Text file."""
    if not os.path.exists(filepath):
        # Treat as raw text if file does not exist
        return filepath

    ext = os.path.splitext(filepath)[1].lower()
    if ext == ".pdf":
        try:
            import fitz
            doc = fitz.open(filepath)
            text = "\n".join(page.get_text() for page in doc)
            doc.close()
            return text
        except Exception:
            pass

        try:
            import subprocess
            r = subprocess.run(["pdftotext", filepath, "-"], capture_output=True, text=True, timeout=10)
            if r.returncode == 0 and r.stdout.strip():
                return r.stdout
        except Exception:
            pass

    try:
        with open(filepath, "r", errors="replace") as f:
            return f.read()
    except OSError as e:
        print(f"Error reading file {filepath}: {e}", file=sys.stderr)
        sys.exit(1)


def main():
    parser = argparse.ArgumentParser(
        description="Extract structured resume profile from text or document using Cactus Needle 2."
    )
    parser.add_argument(
        "input",
        nargs="?",
        default="-",
        help="Path to resume file (.pdf, .txt, .md) or '-' for stdin.",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Output raw JSON only (clean stdout for pipelines).",
    )
    parser.add_argument(
        "--output",
        "-o",
        type=str,
        help="Save extracted JSON profile to a file.",
    )
    parser.add_argument(
        "--benchmark",
        "-b",
        type=int,
        nargs="?",
        const=5,
        default=0,
        help="Run benchmark over N iterations and report latency/throughput statistics.",
    )

    args = parser.parse_args()

    # Read input
    if args.input == "-":
        if sys.stdin.isatty():
            print("Reading from stdin... (Ctrl+D to submit)", file=sys.stderr)
        raw_text = sys.stdin.read()
    else:
        raw_text = extract_file_text(args.input)

    if not raw_text.strip():
        print("Error: Input text is empty.", file=sys.stderr)
        sys.exit(1)

    extractor = NeedleExtractor()
    if not extractor.available:
        print("Error: Cactus Needle is not available. Install via: pip install cactus-needle", file=sys.stderr)
        sys.exit(1)

    # Standard run
    res = extractor.extract_full_profile(raw_text)

    if args.json:
        print(json.dumps(res.profile, indent=2))
        return

    # Formatted CLI presentation
    print("\n" + "=" * 60)
    print("  🪡  easyCV Needle 2 — Structured Resume Extractor")
    print("=" * 60)
    print(f"  • Engine:           Cactus Needle 2 (45M / 14 MB binary)")
    print(f"  • Extraction Time:  {res.elapsed_ms:.1f} ms")
    print(f"  • Candidate Name:   {res.profile.get('name', 'Unknown')}")
    print(f"  • Primary Title:    {res.profile.get('titles', ['None'])[0] if res.profile.get('titles') else 'None'}")
    print(f"  • Contact Email:    {res.profile.get('contact', {}).get('email', 'None')}")
    print(f"  • Contact Phone:    {res.profile.get('contact', {}).get('phone', 'None')}")
    print(f"  • Location:         {res.profile.get('contact', {}).get('location', 'None')}")
    
    skills = res.profile.get("skills", {})
    if isinstance(skills, dict):
        total_skills = sum(len(v) for v in skills.values() if isinstance(v, list))
        print(f"  • Extracted Skills: {total_skills} categorized skills")
        for cat, items in skills.items():
            if items:
                print(f"    - {cat}: {', '.join(items[:6])}")
    
    exp = res.profile.get("experience", [])
    print(f"  • Work Experience:  {len(exp)} roles found")
    for job in exp[:3]:
        print(f"    - {job.get('title', 'Role')} at {job.get('company', 'Company')} ({len(job.get('bullets', []))} bullets)")
    
    edu = res.profile.get("education", [])
    print(f"  • Education:        {len(edu)} degrees found")
    for deg in edu:
        print(f"    - {deg.get('degree', '')} — {deg.get('school', '')}")

    print("=" * 60)

    if args.output:
        with open(args.output, "w") as f:
            json.dump(res.profile, f, indent=2)
        print(f"  ✔ Extracted profile saved to: {args.output}\n")

    # Benchmark mode
    if args.benchmark > 0:
        print(f"\n[Running Benchmark: {args.benchmark} iterations...]")
        latencies = []
        for i in range(args.benchmark):
            t0 = time.perf_counter()
            _ = extractor.extract_full_profile(raw_text)
            latencies.append((time.perf_counter() - t0) * 1000.0)
            print(f"  Iteration {i+1}: {latencies[-1]:.1f} ms")
        
        avg_ms = sum(latencies) / len(latencies)
        min_ms = min(latencies)
        max_ms = max(latencies)
        print(f"\nBenchmark Results: Avg={avg_ms:.1f}ms | Min={min_ms:.1f}ms | Max={max_ms:.1f}ms\n")


if __name__ == "__main__":
    main()
