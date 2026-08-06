"""
EasyCV Seed Data Generator & E2E Fixture Helper
================================================
Creates mock resume bundles, sample PDFs, and JSON profiles for testing
the pipeline CLI and worker daemon end-to-end.
"""

import json
import os
from pathlib import Path

SEED_PERSON = "Alex Mercer"
SEED_OUTPUT_DIR = os.path.expanduser("~/.config/cv-pipeline/seed_data")

SEED_PROFILE = {
    "name": SEED_PERSON,
    "contact": {
        "email": "alex.mercer@example.com",
        "phone": "+1 (555) 019-2834",
        "location": "San Francisco, CA",
        "linkedin": "https://linkedin.com/in/alexmercer-dev",
        "website": "https://alexmercer.dev"
    },
    "titles": ["Senior Full Stack Engineer", "LLM Systems Architect"],
    "summary": "Full stack engineer with 7+ years of experience building resilient cloud services, TypeScript frontends, and autonomous Python pipelines.",
    "skills": {
        "languages": ["TypeScript", "Python", "Go", "SQL"],
        "frameworks": ["Next.js", "React", "Node.js", "FastAPI"],
        "cloud_devops": ["AWS", "Docker", "Kubernetes", "GitHub Actions"],
        "databases": ["PostgreSQL", "Convex", "Redis"],
        "tools": ["Git", "PyMuPDF", "Playwright", "Vitest"]
    },
    "experience": [
        {
            "title": "Lead Platform Engineer",
            "company": "Bytecats Automation Inc.",
            "start": "2023-01",
            "end": "Present",
            "location": "San Francisco, CA",
            "bullets": [
                "Designed and deployed autonomous Python test and refactoring pipelines serving over 10,000 daily jobs.",
                "Built Next.js and Convex real-time web UI, reducing candidate resume processing latency by 45%.",
                "Implemented STE-100 Simplified Technical English validation rules to optimize candidate ATS score matching."
            ]
        },
        {
          "title": "Senior Full Stack Engineer",
          "company": "Apex Cloud Systems",
          "start": "2020-03",
          "end": "2022-12",
          "location": "San Jose, CA",
          "bullets": [
            "Architected distributed REST and GraphQL microservices supporting 2M+ active monthly requests.",
            "Automated PDF document processing using PyMuPDF and OCR bounding-box extraction routines."
          ]
        }
    ],
    "education": [
        {
            "degree": "B.S. Computer Science",
            "school": "University of California, Berkeley",
            "years": "2016 - 2020"
        }
    ],
    "certifications": ["AWS Certified Solutions Architect", "Certified Kubernetes Administrator (CKA)"],
    "languagesSpoken": ["English (Native)", "Spanish (Professional)"]
}

def generate_seed_data(target_dir: str = SEED_OUTPUT_DIR) -> str:
    """Generate seed resume files and JSON fixtures on disk."""
    out_path = Path(target_dir)
    out_path.mkdir(parents=True, exist_ok=True)
    
    # Save seed JSON profile
    profile_path = out_path / "seed_profile.json"
    with open(profile_path, "w", encoding="utf-8") as f:
        json.dump(SEED_PROFILE, f, indent=2)
        
    # Save sample Markdown resume
    md_path = out_path / "Alex_Mercer_Resume.md"
    with open(md_path, "w", encoding="utf-8") as f:
        f.write(f"# {SEED_PERSON}\n\nEmail: alex.mercer@example.com\n\n## Experience\n- Lead Platform Engineer at Bytecats Automation\n- Senior Full Stack Engineer at Apex Cloud\n")
        
    return str(out_path)

if __name__ == "__main__":
    path = generate_seed_data()
    print(f"Seed data generated successfully at: {path}")
