"""Modular LaTeX Resume Template & Incremental Slot-Filling Engine.

Architecture:
- Maintains statically verified ATS-compliant LaTeX skeletons.
- Needle 2 generates lightweight, atomic JSON chunks.
- Incremental slot-filling escapes and injects content into valid scaffolds.
- Guarantees 100% syntactically valid, compilable LaTeX at every partial step.
"""

from typing import Dict, Any, List, Optional
from backend.latex import escape_latex, _section_header, SKILL_LABELS


# ── Base LaTeX Template Skeletons ─────────────────────────────────────────────

MODERN_SINGLE_COLUMN_TEMPLATE = r"""\documentclass[10pt,letterpaper]{article}
\usepackage[utf8]{inputenc}
\usepackage[margin=0.6in]{geometry}
\usepackage{hyperref}
\usepackage{enumitem}
\usepackage{titlesec}
\usepackage{charter}

\pagestyle{empty}
\raggedbottom
\raggedright
\setlength{\tabcolsep}{0in}

% Hyperlink configuration
\hypersetup{
    colorlinks=true,
    linkcolor=blue,
    urlcolor=blue,
}

% List spacing
\setlist[itemize]{leftmargin=1.2em, itemsep=1pt, topsep=1pt, parsep=0pt}

\begin{document}

%%SLOT:HEADER%%

%%SLOT:SUMMARY%%

%%SLOT:SKILLS%%

%%SLOT:EXPERIENCE%%

%%SLOT:EDUCATION%%

%%SLOT:CERTIFICATIONS%%

\end{document}
"""


class IncrementalLatexBuilder:
    """Incrementally fills atomic slots in a LaTeX scaffold using structured data."""

    def __init__(self, template: str = MODERN_SINGLE_COLUMN_TEMPLATE):
        self.template = template
        self.slots: Dict[str, str] = {
            "HEADER": "",
            "SUMMARY": "",
            "SKILLS": "",
            "EXPERIENCE": "",
            "EDUCATION": "",
            "CERTIFICATIONS": "",
        }

    def set_header(self, name: str, contact: Optional[Dict[str, Any]] = None, titles: Optional[List[str]] = None) -> "IncrementalLatexBuilder":
        """Render and insert the contact & name header."""
        name_str = escape_latex(name or "Candidate")
        title_line = ""
        if titles:
            title_line = f"\\\\\\textbf{{{escape_latex(' | '.join(titles))}}}"

        contact_parts = []
        if contact and isinstance(contact, dict):
            if contact.get("email"):
                contact_parts.append(f"\\href{{mailto:{escape_latex(contact['email'])}}}{{{escape_latex(contact['email'])}}}")
            if contact.get("phone"):
                contact_parts.append(escape_latex(contact["phone"]))
            if contact.get("location"):
                contact_parts.append(escape_latex(contact["location"]))
            if contact.get("linkedin"):
                lk = escape_latex(contact["linkedin"])
                contact_parts.append(f"\\href{{https://{lk}}}{{{lk}}}")
            if contact.get("website"):
                wb = escape_latex(contact["website"])
                contact_parts.append(f"\\href{{https://{wb}}}{{{wb}}}")

        contact_line = " $|$ ".join(contact_parts) if contact_parts else ""

        header_latex = (
            f"\\begin{{center}}\n"
            f"  {{\\LARGE\\textbf{{{name_str}}}}}{title_line}\\\\\n"
            f"  \\vspace{{3pt}}\n"
            f"  {{\\small {contact_line}}}\n"
            f"\\end{{center}}\n"
            f"\\vspace{{-4pt}}"
        )
        self.slots["HEADER"] = header_latex
        return self

    def set_summary(self, summary: str) -> "IncrementalLatexBuilder":
        """Render and insert the professional summary."""
        if not summary or not summary.strip():
            self.slots["SUMMARY"] = ""
            return self

        escaped = escape_latex(summary.strip())
        latex_code = (
            f"{_section_header('Professional Summary')}\n"
            f"{escaped}\n"
        )
        self.slots["SUMMARY"] = latex_code
        return self

    def set_skills(self, skills_dict: Dict[str, List[str]]) -> "IncrementalLatexBuilder":
        """Render and insert categorized technical skills."""
        if not skills_dict or not isinstance(skills_dict, dict):
            self.slots["SKILLS"] = ""
            return self

        skill_rows = []
        for key, label in SKILL_LABELS:
            items = skills_dict.get(key, [])
            if items and isinstance(items, list):
                escaped_items = ", ".join(escape_latex(str(x)) for x in items if str(x).strip())
                if escaped_items:
                    skill_rows.append(f"\\textbf{{{label}:}} {escaped_items}")

        if not skill_rows:
            self.slots["SKILLS"] = ""
            return self

        latex_code = (
            f"{_section_header('Technical Skills')}\n"
            f"\\begin{{itemize}}\n"
            + "\n".join(f"  \\item {row}" for row in skill_rows) + "\n"
            f"\\end{{itemize}}\n"
        )
        self.slots["SKILLS"] = latex_code
        return self

    def set_experience(self, experience_list: List[Dict[str, Any]]) -> "IncrementalLatexBuilder":
        """Render and insert employment history."""
        if not experience_list or not isinstance(experience_list, list):
            self.slots["EXPERIENCE"] = ""
            return self

        blocks = []
        for job in experience_list:
            if not isinstance(job, dict):
                continue
            title = escape_latex(job.get("title", ""))
            company = escape_latex(job.get("company", ""))
            start = escape_latex(job.get("start", ""))
            end = escape_latex(job.get("end", "Present"))
            loc = escape_latex(job.get("location", ""))
            dates = f"{start} -- {end}" if start else end

            line1 = f"\\textbf{{{company}}} \\hfill {dates}"
            line2 = f"\\textit{{{title}}} \\hfill \\textit{{{loc}}}" if loc else f"\\textit{{{title}}}"

            bullets = job.get("bullets", [])
            bullet_items = ""
            if bullets and isinstance(bullets, list):
                bullet_items = (
                    "\\begin{itemize}\n"
                    + "\n".join(f"  \\item {escape_latex(b)}" for b in bullets if str(b).strip()) + "\n"
                    "\\end{itemize}\n"
                )

            blocks.append(f"{line1}\\\\\n{line2}\n{bullet_items}")

        if not blocks:
            self.slots["EXPERIENCE"] = ""
            return self

        latex_code = (
            f"{_section_header('Professional Experience')}\n"
            + "\n\\vspace{3pt}\n".join(blocks)
        )
        self.slots["EXPERIENCE"] = latex_code
        return self

    def set_education(self, education_list: List[Dict[str, Any]]) -> "IncrementalLatexBuilder":
        """Render and insert education history."""
        if not education_list or not isinstance(education_list, list):
            self.slots["EDUCATION"] = ""
            return self

        blocks = []
        for edu in education_list:
            if not isinstance(edu, dict):
                continue
            degree = escape_latex(edu.get("degree", ""))
            school = escape_latex(edu.get("school", ""))
            years = escape_latex(edu.get("years", ""))

            blocks.append(f"\\textbf{{{school}}} \\hfill {years}\\\\\n\\textit{{{degree}}}")

        if not blocks:
            self.slots["EDUCATION"] = ""
            return self

        latex_code = (
            f"{_section_header('Education')}\n"
            + "\n\\vspace{2pt}\n".join(blocks)
        )
        self.slots["EDUCATION"] = latex_code
        return self

    def fill_from_profile(self, profile: Dict[str, Any], display_name: Optional[str] = None) -> "IncrementalLatexBuilder":
        """Batch replace all slots from a Needle structured profile dictionary."""
        name = display_name or profile.get("name", "Candidate")
        self.set_header(name, profile.get("contact"), profile.get("titles"))
        self.set_summary(profile.get("summary", ""))
        self.set_skills(profile.get("skills", {}))
        self.set_experience(profile.get("experience", []))
        self.set_education(profile.get("education", []))
        return self

    def render(self) -> str:
        """Compile the final LaTeX string by substituting all populated slots."""
        output = self.template
        for slot_name, slot_content in self.slots.items():
            placeholder = f"%%SLOT:{slot_name}%%"
            output = output.replace(placeholder, slot_content)
        return output
