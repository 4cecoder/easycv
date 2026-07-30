import socket
import json
import urllib.request
import os
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed

CACHE_FILE = Path(__file__).resolve().parent / ".llm_network_cache.json"


def get_local_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
    except Exception:
        ip = "127.0.0.1"
    finally:
        s.close()
    return ip


def get_arp_ips():
    active_ips = set()
    try:
        res = __import__("subprocess").run(["arp", "-an"], capture_output=True, text=True, timeout=2)
        for line in res.stdout.splitlines():
            parts = line.replace("(", "").replace(")", "").split()
            for part in parts:
                try:
                    socket.inet_aton(part)
                    if not part.startswith(("127.", "224.", "255.")):
                        active_ips.add(part)
                except socket.error:
                    pass
    except Exception:
        pass
    return sorted(active_ips)


def check_service(ip, port):
    url = f"http://{ip}:{port}"
    try:
        conn = socket.create_connection((ip, port), timeout=1.5)
        conn.close()
    except Exception:
        return None
    try:
        req = urllib.request.Request(f"{url}/v1/models", method="GET")
        with urllib.request.urlopen(req, timeout=1.5) as res:
            if res.status == 200:
                return {"type": "openai-compat", "base_url": f"{url}/v1", "ip": ip}
    except Exception:
        pass
    try:
        req = urllib.request.Request(f"{url}/api/tags", method="GET")
        with urllib.request.urlopen(req, timeout=1.5) as res:
            if res.status == 200:
                return {"type": "ollama", "base_url": url, "ip": ip}
    except Exception:
        pass
    return None


def discover_llm_servers(ports=None):
    ports = ports or [11434, 1234, 8080, 8000, 3001, 11435]
    cache = {}
    if CACHE_FILE.exists():
        try:
            cache = json.loads(CACHE_FILE.read_text())
        except Exception:
            pass
    ips = get_arp_ips()
    local_ip = get_local_ip()
    candidates = set(["127.0.0.1", local_ip] + ips)
    found = cache.get("servers", [])
    cached_ips = {s["ip"] for s in found}
    new_ips = [ip for ip in candidates if ip not in cached_ips]
    if not new_ips:
        return found
    results = []
    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = {pool.submit(check_service, ip, port): (ip, port) for ip in new_ips for port in ports}
        for future in as_completed(futures, timeout=5):
            result = future.result()
            if result:
                results.append(result)
    found.extend(results)
    cache["servers"] = found
    CACHE_FILE.write_text(json.dumps(cache, indent=2))
    return found
