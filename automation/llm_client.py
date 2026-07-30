import json
import urllib.request
import urllib.error
import urllib.parse
import time
from typing import Optional

from automation.config import get_env


def make_request(url, method="GET", data=None, headers=None, timeout=60):
    req = urllib.request.Request(url, method=method)
    req.add_header("Content-Type", "application/json")
    env = get_env()
    if env["api_key"]:
        req.add_header("Authorization", f"Bearer {env['api_key']}")
    if headers:
        for k, v in headers.items():
            req.add_header(k, v)
    encoded = None
    if data is not None:
        encoded = json.dumps(data).encode("utf-8")
    try:
        with urllib.request.urlopen(req, data=encoded, timeout=timeout) as res:
            return res.status, json.loads(res.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        try:
            body = json.loads(e.read().decode("utf-8"))
        except Exception:
            body = str(e)
        return e.code, body
    except Exception as e:
        return 500, {"error": str(e)}


def chat(
    messages: list[dict],
    model: Optional[str] = None,
    base_url: Optional[str] = None,
    temperature: float = 0.1,
    max_tokens: int = 64000,
    timeout: int = 300,
) -> Optional[str]:
    env = get_env()
    url = f"{base_url or env['base_url']}/chat/completions"
    model = model or env["model"]
    payload = {
        "model": model,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    for attempt in range(3):
        status, resp = make_request(url, method="POST", data=payload, timeout=timeout)
        if status == 200:
            content = resp["choices"][0]["message"].get("content", "")
            reasoning = resp["choices"][0]["message"].get("reasoning_content", "")
            return content or reasoning or None
        if status == 429:
            wait = 2 ** attempt
            print(f"[LLM] rate limited, retrying in {wait}s...")
            time.sleep(wait)
            continue
        print(f"[LLM] request failed (status {status}): {resp}")
        return None
    return None


def extract_code_block(text: str, language: str = "") -> Optional[str]:
    import re
    pattern = rf"```{language}\n(.*?)```"
    matches = re.findall(pattern, text, re.DOTALL)
    if matches:
        return matches[0].strip()
    matches = re.findall(r"```\n(.*?)```", text, re.DOTALL)
    if matches:
        return matches[0].strip()
    return None
