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


_dotenv_loaded = False


def _env_bool(name: str, default: bool) -> bool:
    value = os.environ.get(name)
    if value is None:
        return default
    return value.strip().lower() in ("1", "true", "yes", "on")


def _env_int(name: str, default: int) -> int:
    value = os.environ.get(name)
    if value is None or value.strip() == "":
        return default
    try:
        return int(value)
    except ValueError:
        print(f"[config] warning: invalid integer for {name}={value!r}, using {default}")
        return default


def load_dotenv():
    global _dotenv_loaded
    if _dotenv_loaded:
        return
    env_path = ROOT / ".env"
    if env_path.exists():
        with open(env_path) as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                # Support both `KEY=VALUE` and `export KEY=VALUE` forms.
                if line.startswith("export "):
                    line = line[len("export "):].strip()
                if "=" not in line:
                    continue
                k, v = line.split("=", 1)
                k, v = k.strip(), v.strip()
                if not k:
                    continue
                if k not in os.environ:
                    os.environ[k] = v
    _dotenv_loaded = True


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
        "tdd_max_rounds": _env_int("AUTOMATION_TDD_MAX_ROUNDS", 5),
        "tdd_max_failures": _env_int("AUTOMATION_TDD_MAX_FAILURES", 10),
        "ocr_timeout": _env_int("AUTOMATION_OCR_TIMEOUT", 600),
        "llm_timeout": _env_int("AUTOMATION_LLM_TIMEOUT", 300),
        "playwright_url": os.environ.get("AUTOMATION_PLAYWRIGHT_URL", "http://localhost:3000"),
        "verbose": _env_bool("AUTOMATION_VERBOSE", False),
    }


def run(cmd, **kwargs):
    import subprocess
    if get_env()["verbose"]:
        print(f"[cmd] {' '.join(cmd)}")
    return subprocess.run(cmd, **kwargs)
