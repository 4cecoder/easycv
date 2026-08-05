"""Configuration and environment management for automation scripts."""

import os
import subprocess
from pathlib import Path
from typing import Any, Dict

from backend.constants import WORKER_DOWNLOAD_TIMEOUT

ROOT = Path(__file__).resolve().parent.parent
BACKEND_DIR = ROOT / "backend"
WEB_DIR = ROOT / "web"
TESTS_DIR = ROOT / "tests"
AUTOMATION_DIR = ROOT / "automation"

# Default values for automation environment configuration
DEFAULT_LLM_PROVIDER = "llama.cpp"
DEFAULT_QWEN_BASE_URL = "https://dashscope-intl.aliyuncs.com/compatible-mode/v1"
DEFAULT_OLLAMA_HOST = "http://gentoo.tail125a6c.ts.net:8081"
DEFAULT_MODEL = "ornith-35b-q4k"
DEFAULT_TDD_MAX_ROUNDS = 5
DEFAULT_TDD_MAX_FAILURES = 10
DEFAULT_OCR_TIMEOUT = 600
DEFAULT_LLM_TIMEOUT = 300
DEFAULT_PLAYWRIGHT_URL = "http://localhost:3000"


class ConfigError(Exception):
    """Exception raised for errors in automation configuration."""

    pass


_dotenv_loaded = False


def _env_bool(name: str, default: bool) -> bool:
    """Parse a boolean environment variable."""
    value = os.environ.get(name)
    if value is None:
        return default
    return value.strip().lower() in ("1", "true", "yes", "on")


def _env_int(name: str, default: int) -> int:
    """Parse an integer environment variable with fallback default."""
    value = os.environ.get(name)
    if value is None or value.strip() == "":
        return default
    try:
        return int(value)
    except ValueError:
        print(f"[config] warning: invalid integer for {name}={value!r}, using {default}")
        return default


def load_dotenv() -> None:
    """Load environment variables from .env file into os.environ if present."""
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


def get_env() -> Dict[str, Any]:
    """Retrieve automation configuration settings merged with environment overrides."""
    load_dotenv()
    provider = os.environ.get("AUTOMATION_LLM_PROVIDER", DEFAULT_LLM_PROVIDER)
    base_url = os.environ.get("AUTOMATION_LLM_BASE_URL", "")
    if not base_url:
        if provider == "qwen":
            base_url = DEFAULT_QWEN_BASE_URL
        else:
            ollama_host = os.environ.get("OLLAMA_HOST", DEFAULT_OLLAMA_HOST)
            base_url = ollama_host + "/v1" if not ollama_host.endswith("/v1") else ollama_host
    return {
        "provider": provider,
        "model": os.environ.get("AUTOMATION_MODEL", DEFAULT_MODEL),
        "base_url": base_url,
        "api_key": os.environ.get("AUTOMATION_API_KEY", ""),
        "tdd_max_rounds": _env_int("AUTOMATION_TDD_MAX_ROUNDS", DEFAULT_TDD_MAX_ROUNDS),
        "tdd_max_failures": _env_int("AUTOMATION_TDD_MAX_FAILURES", DEFAULT_TDD_MAX_FAILURES),
        "ocr_timeout": _env_int("AUTOMATION_OCR_TIMEOUT", DEFAULT_OCR_TIMEOUT),
        "llm_timeout": _env_int("AUTOMATION_LLM_TIMEOUT", DEFAULT_LLM_TIMEOUT),
        "playwright_url": os.environ.get("AUTOMATION_PLAYWRIGHT_URL", DEFAULT_PLAYWRIGHT_URL),
        "verbose": _env_bool("AUTOMATION_VERBOSE", False),
    }


def run(cmd, **kwargs) -> subprocess.CompletedProcess:
    """Run a subprocess command with optional logging if verbose mode is enabled."""
    if get_env()["verbose"]:
        print(f"[cmd] {' '.join(cmd)}")
    return subprocess.run(cmd, **kwargs)

