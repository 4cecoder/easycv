"""Network scanner to discover local or network LLM servers."""

import json
import os
import socket
import subprocess
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Any, Dict, List, Optional, Set

CACHE_FILE = Path(__file__).resolve().parent / ".llm_network_cache.json"

DEFAULT_PORTS = [11434, 1234, 8080, 8000, 3001, 11435]
DEFAULT_THREAD_WORKERS = 8
SOCKET_CONNECT_TIMEOUT = 1.5
HTTP_REQUEST_TIMEOUT = 1.5
ARP_SUBPROCESS_TIMEOUT = 2.0
POOL_COMPLETION_TIMEOUT = 5.0
HTTP_OK = 200
DEFAULT_LOCAL_IP = "127.0.0.1"


def get_local_ip() -> str:
    """Determine the primary local IPv4 address of the machine."""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
    except Exception:
        ip = DEFAULT_LOCAL_IP
    finally:
        s.close()
    return ip


def get_arp_ips() -> List[str]:
    """Scan the system ARP table to find active IP addresses on the local network."""
    active_ips: Set[str] = set()
    try:
        res = subprocess.run(["arp", "-an"], capture_output=True, text=True, timeout=ARP_SUBPROCESS_TIMEOUT)
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


def check_service(ip: str, port: int) -> Optional[Dict[str, str]]:
    """Probe an IP and port for an OpenAI-compatible or Ollama LLM endpoint."""
    url = f"http://{ip}:{port}"
    try:
        conn = socket.create_connection((ip, port), timeout=SOCKET_CONNECT_TIMEOUT)
        conn.close()
    except Exception:
        return None
    try:
        req = urllib.request.Request(f"{url}/v1/models", method="GET")
        with urllib.request.urlopen(req, timeout=HTTP_REQUEST_TIMEOUT) as res:
            if res.status == HTTP_OK:
                return {"type": "openai-compat", "base_url": f"{url}/v1", "ip": ip}
    except Exception:
        pass
    try:
        req = urllib.request.Request(f"{url}/api/tags", method="GET")
        with urllib.request.urlopen(req, timeout=HTTP_REQUEST_TIMEOUT) as res:
            if res.status == HTTP_OK:
                return {"type": "ollama", "base_url": url, "ip": ip}
    except Exception:
        pass
    return None


def discover_llm_servers(ports: Optional[List[int]] = None) -> List[Dict[str, str]]:
    """Discover LLM servers on local and ARP network candidates and update local cache file."""
    ports = ports or DEFAULT_PORTS
    cache: Dict[str, Any] = {}
    if CACHE_FILE.exists():
        try:
            cache = json.loads(CACHE_FILE.read_text())
        except Exception:
            pass
    ips = get_arp_ips()
    local_ip = get_local_ip()
    candidates = set([DEFAULT_LOCAL_IP, local_ip] + ips)
    found = cache.get("servers", [])
    cached_ips = {s["ip"] for s in found}
    new_ips = [ip for ip in candidates if ip not in cached_ips]
    if not new_ips:
        return found
    results = []
    with ThreadPoolExecutor(max_workers=DEFAULT_THREAD_WORKERS) as pool:
        futures = {pool.submit(check_service, ip, port): (ip, port) for ip in new_ips for port in ports}
        for future in as_completed(futures, timeout=POOL_COMPLETION_TIMEOUT):
            result = future.result()
            if result:
                results.append(result)
    found.extend(results)
    cache["servers"] = found
    CACHE_FILE.write_text(json.dumps(cache, indent=2))
    return found

