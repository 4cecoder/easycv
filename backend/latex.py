#!/usr/bin/env python3
"""
LaTeX Resume Rendering
=======================
Renders the structured JSON produced by ``pipeline.llm_consolidate`` into a
clean, single-column, ATS-safe LaTeX (.tex) resume, and optionally compiles
it to a PDF via ``pdflatex``.

The structured data ultimately originates from LLM output over arbitrary,
untrusted, user-uploaded PDFs, so every string interpolated into the .tex
source is escaped via ``escape_latex`` before insertion. Missing/null/empty
fields are tolerated everywhere — this module must never crash on partial
or malformed structured data.
"""

import os
import subprocess
from typing import Optional


# ── Escaping ────────────────────────────────────

# This function performs a single character-by-character pass over the input,
# replacing each special LaTeX character with its escaped counterpart.
_LATEX_SPECIAL_CHARS = {
    "\\": r"\textbackslash{}",
    "&": r"\&",
    "%": r"\%",
    "$": r"\$",
    "#": r"\#",
    "_": r"\_",
    "{": r"\{",
    "}": r"\}",
    "~": r"\textasciitilde{}",
    "^": r"\textasciicircum{}",
}


def escape_latex(s) -> str:
    """Escape a value for safe interpolation into LaTeX source.

    Accepts anything; non-strings are stringified. None becomes "".
    """
    if s is None:
        return ""
    if not isinstance(s, str):
        s = str(s)
    return "".join(_LATEX_SPECIAL_CHARS.get(ch, ch) for ch in s)


# ── Small data-shape helpers (defensive against partial LLM output) ────


def _str(v) -> str:
    if isinstance(v, str) and v.strip():
        return v.strip()
    return ""


def _list(v) -> list:
    if isinstance(v, list):
        return [x for x in v if isinstance(x, str) and x.strip()]
    return []


def _dict(v) -> dict:
    return v if isinstance(v, dict) else {}


def _section_header(title: str) -> str:
    return (
        f"\\vspace{{6pt}}\n"
        f"\\noindent{{\\large\\textbf{{{title}}}}}\\\\[-2pt]\n"
        f"\\hrule\n"
        f"\\vspace{{4pt}}"
    )


SKILL_LABELS = [
    ("languages", "Languages"),
    ("frameworks", "Frameworks"),
    ("cloud_devops", "Cloud/DevOps"),
    ("databases", "Databases"),
    ("tools", "Tools"),
]


# ── Rendering ───────────────────────────────────


def render_latex(data: dict, name: str) -> str:
    """Render structured resume ``data`` into a complete .tex document string.

    ``name`` is used as a fallback if ``data`` has no usable "name" field.
    Every field in ``data`` is optional — this function never raises on
    missing, null, or empty fields.
    """
    data = data if isinstance(data, dict) else {}

    display_name = _str(data.get("name")) or _str(name) or "Resume"
    titles = _list(data.get("titles"))
    contact = _dict(data.get("contact"))
    summary = _str(data.get("summary"))
    skills = _dict(data.get("skills"))
    experience = data.get("experience") if isinstance(data.get("experience"), list) else []
    education = data.get("education") if isinstance(data.get("education"), list) else []
    certifications = _list(data.get("certifications"))
    languages_spoken = _list(data.get("languages_spoken"))

    lines = [
        r"\documentclass[11pt]{article}",
        r"\usepackage[margin=0.75in]{geometry}",
        r"\pagestyle{empty}",
        r"\setlength{\parindent}{0pt}",
        r"\begin{document}",
        "",
        r"\begin{center}",
        f"{{\\Large \\textbf{{{escape_latex(display_name)}}}}}\\\\[3pt]",
    ]

    if titles:
        title_line = ", ".join(escape_latex(t) for t in titles)
        lines.append(f"{{{title_line}}}\\\\[3pt]")

    contact_parts = []
    for key in ("location", "email", "phone", "linkedin", "website"):
        val = _str(contact.get(key))
        if val:
            contact_parts.append(escape_latex(val))
    if contact_parts:
        lines.append(" $\\vert$ ".join(contact_parts) + r"\\[3pt]")

    lines.append(r"\end{center}")

    if summary:
        lines.append(_section_header("Summary"))
        lines.append(escape_latex(summary))

    skill_lines = []
    for key, label in SKILL_LABELS:
        items = _list(skills.get(key))
        if items:
            joined = ", ".join(escape_latex(i) for i in items)
            skill_lines.append(f"\\textbf{{{label}:}} {joined}\\\\")
    if skill_lines:
        lines.append(_section_header("Skills"))
        lines.extend(skill_lines)

    exp_blocks = []
    for exp in experience:
        exp = _dict(exp)
        title = escape_latex(_str(exp.get("title")))
        company = escape_latex(_str(exp.get("company")))
        start = escape_latex(_str(exp.get("start")))
        end = escape_latex(_str(exp.get("end")))
        location = escape_latex(_str(exp.get("location")))
        bullets = _list(exp.get("bullets"))

        if title and company:
            header_left = f"{title} --- {company}"
        else:
            header_left = title or company

        if start and end:
            date_range = f"{start} -- {end}"
        else:
            date_range = start or end

        if not (header_left or date_range or location or bullets):
            continue  # nothing usable in this entry — skip it silently

        block = []
        left_part = f"\\textbf{{{header_left}}}" if header_left else ""
        if left_part or date_range:
            block.append(f"{left_part} \\hfill {date_range}\\\\".strip())
        if location:
            block.append(f"\\textit{{{location}}}\\\\")
        if bullets:
            block.append(r"\begin{itemize}\itemsep0pt\parskip0pt")
            for b in bullets:
                block.append(f"\\item {escape_latex(b)}")
            block.append(r"\end{itemize}")
        block.append(r"\vspace{2pt}")
        exp_blocks.append("\n".join(block))

    if exp_blocks:
        lines.append(_section_header("Experience"))
        lines.extend(exp_blocks)

    edu_lines = []
    for edu in education:
        edu = _dict(edu)
        degree = escape_latex(_str(edu.get("degree")))
        school = escape_latex(_str(edu.get("school")))
        years = escape_latex(_str(edu.get("years")))

        if degree and school:
            header_left = f"{degree} --- {school}"
        else:
            header_left = degree or school

        if not (header_left or years):
            continue

        left_part = f"\\textbf{{{header_left}}}" if header_left else ""
        edu_lines.append(f"{left_part} \\hfill {years}\\\\".strip())

    if edu_lines:
        lines.append(_section_header("Education"))
        lines.extend(edu_lines)

    if certifications:
        lines.append(_section_header("Certifications"))
        lines.append(r"\begin{itemize}\itemsep0pt\parskip0pt")
        for cert in certifications:
            lines.append(f"\\item {escape_latex(cert)}")
        lines.append(r"\end{itemize}")

    if languages_spoken:
        lines.append(_section_header("Languages"))
        lines.append(", ".join(escape_latex(l) for l in languages_spoken))

    lines.append("")
    lines.append(r"\end{document}")
    lines.append("")

    return "\n".join(lines)


# ── PDF Compilation ─────────────────────────────


def compile_pdf(tex_path: str, output_dir: str) -> Optional[str]:
    """Compile ``tex_path`` with ``pdflatex`` into ``output_dir``.

    Returns the path to the produced PDF, or None on any failure (missing
    pdflatex, timeout, permission error, or a nonzero exit / missing output
    file). Never raises — .tex generation must succeed independently of
    whether PDF compilation is available.
    """
    tex_path = os.path.abspath(tex_path)
    output_dir = os.path.abspath(output_dir)

    # Validate that the resolved output directory stays within the directory
    # containing the tex file to prevent path-traversal attacks (e.g. an
    # attacker supplying ``../../../etc/cron.d/`` as ``output_dir``).
    base_dir = os.path.dirname(tex_path)
    if not (output_dir == base_dir or output_dir.startswith(base_dir + os.sep)):
        print(
            f"  [error] output_dir ({output_dir}) is outside base_dir "
            f"({base_dir}); aborting PDF compilation"
        )
        return None

    os.makedirs(output_dir, exist_ok=True)

    args = [
        "pdflatex",
        "-interaction=nonstopmode",
        "-halt-on-error",
        "-no-shell-escape",
        "-output-directory", output_dir,
        tex_path,
    ]

    try:
        result = subprocess.run(
            args, cwd=output_dir, capture_output=True, text=True, timeout=30,
        )
    except Exception as e:
        print(f"  [warn] pdflatex failed with {type(e).__name__}: {e}; skipping PDF compilation")
        return None

    pdf_name = os.path.splitext(os.path.basename(tex_path))[0] + ".pdf"
    pdf_path = os.path.join(output_dir, pdf_name)

    if result.returncode != 0 or not os.path.isfile(pdf_path):
        # Surface a truncated excerpt of the stderr so operators can diagnose
        # LaTeX compilation failures without needing to dig through log files.
        stderr_excerpt = ""
        if result.stderr:
            lines = result.stderr.strip().splitlines()
            if len(lines) > 10:
                lines = lines[-10:]
            stderr_excerpt = "\n".join(lines)
            if len(stderr_excerpt) > 500:
                stderr_excerpt = stderr_excerpt[:500] + "... (truncated)"
        print(f"  [warn] pdflatex failed (exit {result.returncode}); stderr: {stderr_excerpt}")
        return None

    return pdf_path
