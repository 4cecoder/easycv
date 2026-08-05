import json
import urllib.request
import urllib.error
import urllib.parse
import time
from typing import Optional

from automation.config import get_env


import json
import time
from typing import Optional
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

from automation.config import get_env

TRANSIENT_STATUS = {408, 429, 500, 502, 503, 504}


def make_request(url, method="GET", data=None, headers=None, timeout=60):
    req = Request(url, method=method)
    if data is not None or method in ("POST", "PUT", "PATCH"):
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
        with urlopen(req, data=encoded, timeout=timeout) as res:
            return res.status, json.loads(res.read().decode("utf-8"))
    except HTTPError as e:
        try:
            body = json.loads(e.read().decode("utf-8"))
        except json.JSONDecodeError:
            body = str(e)
        return e.code, body
    except (URLError, TimeoutError, OSError) as e:
        return 599, {"error": str(e)}
    except Exception as e:
        return 500, {"error": str(e)}


def chat(
    messages: list[dict],
    model: Optional[str] = None,
    base_url: Optional[str] = None,
    temperature: float = 0.1,
    max_tokens: int = 64000,
    timeout: Optional[int] = None,
    max_retries: int = 3,
) -> Optional[str]:
    env = get_env()
    url = f"{base_url or env['base_url']}/chat/completions"
    model = model or env["model"]
    timeout = timeout or env["llm_timeout"]
    payload = {
        "model": model,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    last_error = None
    for attempt in range(max_retries):
        status, resp = make_request(url, method="POST", data=payload, timeout=timeout)
        if status == 200:
            # Fix: Guard against empty choices array
            choices = resp.get("choices", [])
            if not choices:
                print(f"[LLM] no choices in response: {resp}")
                return None

            # Fix: Use nested .get() to avoid KeyError/TypeError
            first_choice = choices[0]
            if not isinstance(first_choice, dict):
                print(f"[LLM] first choice is not a dict: {first_choice}")
                return None

            message = first_choice.get("message", {})
            if not isinstance(message, dict):
                print(f"[LLM] message is not a dict: {message}")
                return None

            content = message.get("content", "")
            reasoning = message.get("reasoning_content", "")

            # Fix: Use explicit if/else instead of truthiness checks
            if content is not None and content != "":
                return content
            if reasoning is not None and reasoning != "":
                return reasoning
            print(f"[LLM] response had empty content: {resp}")
            return None
        last_error = resp
        if status in TRANSIENT_STATUS:
            wait = 2 ** attempt
            print(f"[LLM] transient error (status {status}), retrying in {wait}s... {resp}")
            time.sleep(wait)
            continue
        print(f"[LLM] request failed (status {status}): {resp}")
        return None
    print(f"[LLM] giving up after {max_retries} attempts: {last_error}")
    return None


def extract_code_block(text: str, language: str = "") -> Optional[str]:
    import re
    # Fix: Escape the language parameter to prevent ReDoS
    escaped_language = re.escape(language)
    pattern = rf"```{escaped_language}\n(.*?)```"
    matches = re.findall(pattern, text, re.DOTALL)
    if matches:
        return matches[0].strip()
    matches = re.findall(r"```\n(.*?)```", text, re.DOTALL)
    if matches:
        return matches[0].strip()
    return None