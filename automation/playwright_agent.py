import os
import subprocess
import sys
import time
import json
from pathlib import Path
from typing import Optional

from automation.config import ROOT, WEB_DIR, get_env
from automation.llm_client import chat, extract_code_block
from automation.test_orchestration import run_playwright


def start_dev_server(timeout: int = 30) -> subprocess.Popen:
    proc = subprocess.Popen(
        ["bun", "run", "dev"],
        cwd=str(WEB_DIR),
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    start = time.time()
    while time.time() - start < timeout:
        line = proc.stderr.readline() if proc.stderr else b""
        if b"ready" in line.lower() or b"started" in line.lower() or b"localhost" in line.lower():
            print(f"[playwright] dev server ready")
            return proc
        time.sleep(0.5)
    print(f"[playwright] dev server may not be ready, continuing anyway")
    return proc


def stop_dev_server(proc: subprocess.Popen):
    proc.terminate()
    try:
        proc.wait(timeout=5)
    except subprocess.TimeoutExpired:
        proc.kill()


def run_test(target: str = "", headless: bool = True) -> dict:
    return run_playwright(headless=headless, target=target or None)


def analyze_output(result: dict) -> Optional[str]:
    env = get_env()
    if result["returncode"] == 0:
        return None
    prompt = (
        f"A Playwright test run produced the following output:\n\n"
        f"STDOUT:\n{result.get('stdout', '')[:4000]}\n\n"
        f"STDERR:\n{result.get('stderr', '')[:4000]}\n\n"
        f"Analyze the failures. Suggest specific fixes to the source code "
        f"(in web/) that would resolve these test failures. "
        f"Return fixes as a JSON list: [{{\"file\": \"path\", \"issue\": \"...\", \"fix\": \"...\"}}]"
    )
    response = chat([{"role": "user", "content": prompt}], temperature=0.1, max_tokens=2048)
    return response


def run_and_analyze(target: str = "", headless: bool = True) -> dict:
    result = run_test(target, headless)
    analysis = analyze_output(result)
    return {"result": result, "analysis": analysis}


def full_pipeline(target: str = "", headless: bool = True) -> dict:
    print("[playwright] starting dev server...")
    server = start_dev_server()
    try:
        print("[playwright] running tests...")
        result = run_test(target, headless)
        print(f"  returncode: {result['returncode']}")
        if result["returncode"] != 0:
            analysis = analyze_output(result)
            return {"result": result, "analysis": analysis}
        return {"result": result, "analysis": None}
    finally:
        stop_dev_server(server)
