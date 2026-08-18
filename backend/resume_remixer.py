"""Smart Categorization, Dynamic Remixing & High-Speed Caching Layer for easyCV.

Capabilities:
1. Smart Categorization: Categorizes skills, career milestones, and tech domains.
2. Dynamic Remixing: Re-orders, filters, and tailors resumes on the fly for specific role targets.
3. Multi-Tier Cache: Content-hashed (SHA-256) caching for extraction, remixing, and LaTeX compilation.
"""

import hashlib
import json
import time
from typing import Any, Dict, List, Optional, Set
from backend.latex_templates import IncrementalLatexBuilder


# ── Taxonomy & Smart Categorization ───────────────────────────────────────────

TECH_TAXONOMY = {
    "ai_ml": {
        "PyTorch", "TensorFlow", "Ray", "vLLM", "ONNX", "TensorRT", "CUDA", "Triton",
        "Transformers", "Hugging Face", "LLM", "Diffusion", "LangChain", "Vector DB"
    },
    "cloud_devops": {
        "Kubernetes", "Docker", "Terraform", "AWS", "GCP", "Azure", "Helm", "CI/CD",
        "Linux", "Prometheus", "Grafana", "Vultr", "Tailscale", "Istio"
    },
    "backend_systems": {
        "Rust", "Go", "Golang", "C++", "C#", "Java", "Python", "PostgreSQL", "Redis",
        "Convex", "SQLite", "MongoDB", "gRPC", "GraphQL", "Kafka", "RabbitMQ"
    },
    "frontend_fullstack": {
        "TypeScript", "JavaScript", "React", "Next.js", "Vue", "TailwindCSS", "Node.js",
        "HTML5", "CSS3", "WebGPU", "WebAssembly"
    }
}


class SmartCategorizer:
    """Classifies skills, competencies, and experience items into categorized buckets."""

    @staticmethod
    def classify_skill(skill: str) -> str:
        """Map an individual skill to its primary taxonomy category."""
        s_clean = skill.strip().lower()
        for cat, keywords in TECH_TAXONOMY.items():
            for kw in keywords:
                if kw.lower() == s_clean or kw.lower() in s_clean:
                    return cat
        return "tools"

    @classmethod
    def categorize_skills(cls, flat_skills: List[str]) -> Dict[str, List[str]]:
        """Group a flat list of skills into taxonomy buckets."""
        buckets: Dict[str, List[str]] = {
            "languages": [],
            "frameworks": [],
            "cloud_devops": [],
            "databases": [],
            "tools": []
        }

        lang_set = {"python", "rust", "go", "golang", "c++", "c#", "typescript", "javascript", "sql", "java", "ruby", "swift"}
        db_set = {"postgresql", "redis", "convex", "sqlite", "mongodb", "mysql", "dynamodb", "cassandra"}

        for s in flat_skills:
            s_low = s.lower().strip()
            if s_low in lang_set:
                buckets["languages"].append(s)
            elif s_low in db_set:
                buckets["databases"].append(s)
            elif cls.classify_skill(s) == "cloud_devops":
                buckets["cloud_devops"].append(s)
            elif cls.classify_skill(s) in ("ai_ml", "frontend_fullstack"):
                buckets["frameworks"].append(s)
            else:
                buckets["tools"].append(s)

        # Deduplicate preserving order
        for k in buckets:
            buckets[k] = list(dict.fromkeys(buckets[k]))

        return buckets


# ── High-Speed Caching Layer ──────────────────────────────────────────────────

class ResumeCache:
    """In-memory SHA-256 hash cache for sub-millisecond remixing and pipeline reuse."""

    def __init__(self, max_entries: int = 500):
        self._cache: Dict[str, Any] = {}
        self._access_times: Dict[str, float] = {}
        self._max_entries = max_entries

    def _hash_key(self, payload: Any) -> str:
        serialized = json.dumps(payload, sort_keys=True, default=str)
        return hashlib.sha256(serialized.encode("utf-8")).hexdigest()

    def get(self, key_payload: Any) -> Optional[Any]:
        k = self._hash_key(key_payload)
        if k in self._cache:
            self._access_times[k] = time.time()
            return self._cache[k]
        return None

    def set(self, key_payload: Any, value: Any) -> None:
        if len(self._cache) >= self._max_entries:
            # Evict oldest entry
            oldest_k = min(self._access_times, key=self._access_times.get)
            del self._cache[oldest_k]
            del self._access_times[oldest_k]

        k = self._hash_key(key_payload)
        self._cache[k] = value
        self._access_times[k] = time.time()

    def clear(self) -> None:
        self._cache.clear()
        self._access_times.clear()


# Global cache instance
global_resume_cache = ResumeCache()


# ── Dynamic Remixing Engine ───────────────────────────────────────────────────

class ResumeRemixer:
    """Remixes, prioritizes, and customizes structured profiles on the fly."""

    def __init__(self, cache: Optional[ResumeCache] = None):
        self.cache = cache or global_resume_cache

    def remix_profile(
        self,
        base_profile: Dict[str, Any],
        target_role: Optional[str] = None,
        highlight_skills: Optional[List[str]] = None,
        max_bullets_per_job: int = 4,
    ) -> Dict[str, Any]:
        """Dynamically tailor a structured profile for a target role or focus."""
        cache_key = {
            "profile": base_profile,
            "target_role": target_role,
            "highlight_skills": highlight_skills,
            "max_bullets": max_bullets_per_job,
        }

        cached = self.cache.get(cache_key)
        if cached:
            return cached

        remixed = json.loads(json.dumps(base_profile))  # Deep copy

        # 1. Tailor title & summary if target role specified
        if target_role:
            existing_titles = remixed.get("titles", [])
            remixed["titles"] = [target_role] + [t for t in existing_titles if t.lower() != target_role.lower()]

        # 2. Re-prioritize skills
        if highlight_skills and remixed.get("skills"):
            target_set = {s.lower() for s in highlight_skills}
            for cat, items in remixed["skills"].items():
                if isinstance(items, list):
                    # Sort matching highlight skills to the front
                    matching = [x for x in items if x.lower() in target_set]
                    remaining = [x for x in items if x.lower() not in target_set]
                    remixed["skills"][cat] = matching + remaining

        # 3. Filter and prioritize experience bullets
        if remixed.get("experience"):
            for job in remixed["experience"]:
                bullets = job.get("bullets", [])
                if highlight_skills:
                    # Sort bullets containing highlight keywords higher
                    scored_bullets = []
                    for b in bullets:
                        match_count = sum(1 for kw in highlight_skills if kw.lower() in b.lower())
                        scored_bullets.append((match_count, b))
                    scored_bullets.sort(key=lambda x: x[0], reverse=True)
                    job["bullets"] = [b for _, b in scored_bullets][:max_bullets_per_job]
                else:
                    job["bullets"] = bullets[:max_bullets_per_job]

        self.cache.set(cache_key, remixed)
        return remixed

    def remix_and_render_latex(
        self,
        base_profile: Dict[str, Any],
        target_role: Optional[str] = None,
        highlight_skills: Optional[List[str]] = None,
    ) -> str:
        """Remix profile and compile directly to valid LaTeX in one shot."""
        remixed = self.remix_profile(base_profile, target_role, highlight_skills)
        builder = IncrementalLatexBuilder()
        builder.fill_from_profile(remixed)
        return builder.render()
