"""Unit tests for Modular LaTeX Template Incremental Slot-Filling Engine."""

from backend.latex_templates import IncrementalLatexBuilder, MODERN_SINGLE_COLUMN_TEMPLATE


def test_builder_initialization():
    builder = IncrementalLatexBuilder()
    rendered = builder.render()
    assert "\\begin{document}" in rendered
    assert "\\end{document}" in rendered
    # All slot markers are stripped/replaced with empty strings
    assert "%%SLOT:" not in rendered


def test_builder_header_and_escaping():
    builder = IncrementalLatexBuilder()
    builder.set_header(
        name="Alex O'Connor & Sons",
        contact={"email": "alex_test@domain.com", "phone": "555-1234", "linkedin": "linkedin.com/in/alex_test"},
        titles=["Lead Cloud Architect & AI Lead"]
    )
    rendered = builder.render()

    # Verify LaTeX special characters are safely escaped
    assert r"Alex O'Connor \& Sons" in rendered
    assert r"alex\_test@domain.com" in rendered
    assert r"Lead Cloud Architect \& AI Lead" in rendered
    assert r"\href{mailto:alex\_test@domain.com}" in rendered


def test_builder_incremental_slots():
    builder = IncrementalLatexBuilder()
    
    # 1. Fill summary only
    builder.set_summary("Experienced systems architect with 10+ years in distributed databases.")
    rendered = builder.render()
    assert "Professional Summary" in rendered
    assert "Experienced systems architect" in rendered

    # 2. Fill skills
    builder.set_skills({
        "languages": ["Rust", "Python", "Go"],
        "cloud_devops": ["Kubernetes", "Docker", "Terraform"],
    })
    rendered = builder.render()
    assert "Technical Skills" in rendered
    assert "Languages:" in rendered
    assert "Rust, Python, Go" in rendered

    # 3. Fill experience
    builder.set_experience([
        {
            "title": "Staff Engineer",
            "company": "CloudScale Inc.",
            "start": "2021",
            "end": "Present",
            "location": "San Francisco, CA",
            "bullets": [
                "Engineered vector search index reducing p99 retrieval latency by 45%.",
                "Managed Kubernetes clusters handling 50k RPS."
            ]
        }
    ])
    rendered = builder.render()
    assert "Professional Experience" in rendered
    assert "CloudScale Inc." in rendered
    assert "Staff Engineer" in rendered
    assert "Engineered vector search index" in rendered


def test_builder_fill_from_needle_profile():
    profile = {
        "name": "Sarah Connor",
        "contact": {"email": "sarah@resistance.org", "phone": "555-9000"},
        "titles": ["Lead Infrastructure Architect"],
        "summary": "Specialist in cybernetic infrastructure defense.",
        "skills": {"languages": ["C++", "Rust", "Assembly"]},
        "experience": [
            {
                "title": "Defense Lead",
                "company": "Cyberdyne Systems",
                "start": "2022",
                "end": "Present",
                "bullets": ["Protected vital systems with 100% uptime."]
            }
        ],
        "education": [
            {
                "degree": "B.S. in Computer Science",
                "school": "Caltech",
                "years": "2018"
            }
        ]
    }

    builder = IncrementalLatexBuilder()
    builder.fill_from_profile(profile)
    rendered = builder.render()

    assert "Sarah Connor" in rendered
    assert "sarah@resistance.org" in rendered
    assert "Cyberdyne Systems" in rendered
    assert "Caltech" in rendered
    assert "\\begin{document}" in rendered
    assert "\\end{document}" in rendered
