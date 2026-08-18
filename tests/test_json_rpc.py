"""Unit tests for easyCV JSON-RPC 2.0 Edge Server."""

import pytest
from backend.json_rpc_server import EdgeRpcDispatcher


def test_rpc_detect_resources():
    dispatcher = EdgeRpcDispatcher()
    req = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "system.detectResources",
        "params": {},
    }
    resp = dispatcher.dispatch(req)
    assert resp["jsonrpc"] == "2.0"
    assert resp["id"] == 1
    assert "result" in resp
    assert "cpu_cores" in resp["result"]
    assert "engine" in resp["result"]


def test_rpc_ste100_lint():
    dispatcher = EdgeRpcDispatcher()
    req = {
        "jsonrpc": "2.0",
        "id": 2,
        "method": "ste100.lint",
        "params": {
            "bullets": [
                "Architected Kubernetes microservices for 45k RPS with 99.99% uptime.",
                "The project was managed by me and it took long; also had issues."
            ]
        },
    }
    resp = dispatcher.dispatch(req)
    assert resp["id"] == 2
    assert "result" in resp
    bullets = resp["result"]["bullets"]
    assert len(bullets) == 2
    assert bullets[0]["is_compliant"] is True
    assert bullets[1]["is_compliant"] is False


def test_rpc_latex_render():
    dispatcher = EdgeRpcDispatcher()
    req = {
        "jsonrpc": "2.0",
        "id": 3,
        "method": "latex.render",
        "params": {
            "name": "Jane Doe",
            "profile": {
                "name": "Jane Doe",
                "titles": ["Senior Systems Architect"],
                "skills": {"languages": ["Rust", "Go"]},
            }
        },
    }
    resp = dispatcher.dispatch(req)
    assert resp["id"] == 3
    assert "result" in resp
    assert "\\begin{document}" in resp["result"]["tex"]
    assert "Jane Doe" in resp["result"]["tex"]


def test_rpc_invalid_method():
    dispatcher = EdgeRpcDispatcher()
    req = {
        "jsonrpc": "2.0",
        "id": 4,
        "method": "unknown.method",
        "params": {},
    }
    resp = dispatcher.dispatch(req)
    assert "error" in resp
    assert resp["error"]["code"] == -32601
