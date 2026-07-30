import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BACKEND_DIR = ROOT / "backend"
WEB_DIR = ROOT / "web"
TESTS_DIR = ROOT / "tests"
AUTOMATION_DIR = ROOT / "automation"


class ConfigError(Exception):
    pass


def load_dotenv():
    env_path = ROOT / ".env"
    if not env_path.exists():
        return
    with open(env_path) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            k, v = k.strip(), v.strip()
            if k not in os.environ:
                os.environ[k] = v


def get_env():
    load_dotenv()
    provider = os.environ.get("AUTOMATION_LLM_PROVIDER", "llama.cpp")
    base_url = os.environ.get("AUTOMATION_LLM_BASE_URL", "")
    if not base_url:
        if provider == "qwen":
            base_url = "https://dashscope-intl.aliyuncs.com/compatible-mode/v1"
        else:
            ollama_host = os.environ.get("OLLAMA_HOST", "http://gentoo.tail125a6c.ts.net:8081")
            base_url = ollama_host + "/v1" if not ollama_host.endswith("/v1") else ollama_host
    return {
        "provider": provider,
        "model": os.environ.get("AUTOMATION_MODEL", "ornith-35b-q4k"),
        "base_url": base_url,
        "api_key": os.environ.get("AUTOMATION_API_KEY", ""),
        "tdd_max_rounds": int(os.environ.get("AUTOMATION_TDD_MAX_ROUNDS", "5")),
        "tdd_max_failures": int(os.environ.get("AUTOMATION_TDD_MAX_FAILURES", "10")),
        "playwright_url": os.environ.get("AUTOMATION_PLAYWRIGHT_URL", "http://localhost:3000"),
        "verbose": os.environ.get("AUTOMATION_VERBOSE", "0") == "1",
    }


def run(cmd, **kwargs):
    import subprocess
    if get_env()["verbose"]:
        print(f"[cmd] {' '.join(cmd)}")
    return subprocess.run(cmd, **kwargs)
