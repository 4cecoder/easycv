#!/usr/bin/env python3
"""
api_server.py -- HTTP API server for easyCV backend admin/ops.

Exposes admin endpoints that Next.js can call via Tailscale for worker control,
LLM provider switching, metrics, and health monitoring.

Usage:
    uv run python -m backend.api_server --port 8000 --host 0.0.0.0

Config (env vars, loaded from web/.env.local if present):
    TAILSCALE_URL                    Tailscale network URL (e.g., gentoo.tail125a6c.ts.net)
    API_SECRET                       Shared secret for API authentication (required)
    NEXT_PUBLIC_CONVEX_URL / CONVEX_URL   Convex deployment URL
    WORKER_SECRET                    Secret for Convex worker mutations
    LLM_PROVIDER, LLM_MODEL, OLLAMA_API_BASE, OLLAMA_TIMEOUT
                                    LLM configuration

Next.js Integration:
    Set TAILSCALE_URL env var in Next.js (e.g., http://gentoo.tail125a6c.ts.net:8000)
    All API calls require: Authorization: Bearer <API_SECRET>
"""

import argparse
import os
import signal
import subprocess
import sys
import threading
import time
import traceback
from contextlib import asynccontextmanager
from dataclasses import dataclass, asdict
from datetime import datetime
from enum import Enum
from pathlib import Path
from typing import Optional, Any, Dict, List

import psutil
from fastapi import FastAPI, HTTPException, Header, Depends, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from dotenv import load_dotenv

from convex import ConvexClient
from backend import pipeline
from backend.pipeline import LLMClient


# --- Configuration -----------------------------------------------------------

def load_config() -> Dict[str, Optional[str]]:
    """Load configuration from environment variables."""
    env_path = Path(__file__).parent.parent / "web" / ".env.local"
    if env_path.exists():
        load_dotenv(env_path, override=True)

    convex_url = os.environ.get("NEXT_PUBLIC_CONVEX_URL") or os.environ.get("CONVEX_URL")
    worker_secret = os.environ.get("WORKER_SECRET")
    api_secret = os.environ.get("API_SECRET")
    tailscale_url = os.environ.get("TAILSCALE_URL", "0.0.0.0")

    if not api_secret:
        sys.exit("[api_server] API_SECRET must be set (set in web/.env.local)")
    if not convex_url:
        sys.exit("[api_server] NEXT_PUBLIC_CONVEX_URL or CONVEX_URL must be set")
    if not worker_secret:
        sys.exit("[api_server] WORKER_SECRET must be set")

    return {
        "convex_url": convex_url,
        "worker_secret": worker_secret,
        "api_secret": api_secret,
        "tailscale_url": tailscale_url,
    }


# --- Worker Process Management ----------------------------------------------

class WorkerStatus(str, Enum):
    """Worker process status."""
    STOPPED = "stopped"
    STARTING = "starting"
    RUNNING = "running"
    STOPPING = "stopping"
    ERROR = "error"


@dataclass
class WorkerState:
    """Current worker process state."""
    status: WorkerStatus = WorkerStatus.STOPPED
    pid: Optional[int] = None
    started_at: Optional[datetime] = None
    last_error: Optional[str] = None
    processed_count: int = 0
    uptime_seconds: float = 0.0


_worker_state = WorkerState()
_worker_lock = threading.Lock()
_worker_process: Optional[Any] = None
_shutdown_requested = False


def start_worker_process(convex_url: str, worker_secret: str) -> bool:
    """Start the worker process as a subprocess."""
    global _worker_process, _worker_state

    # Type assertions for type checker
    if not isinstance(convex_url, str):
        raise TypeError(f"convex_url must be str, got {type(convex_url)}")
    if not isinstance(worker_secret, str):
        raise TypeError(f"worker_secret must be str, got {type(worker_secret)}")

    with _worker_lock:
        if _worker_state.status in (WorkerStatus.RUNNING, WorkerStatus.STARTING):
            return False

        _worker_state.status = WorkerStatus.STARTING
        _worker_state.last_error = None

        try:
            _worker_process = subprocess.Popen(
                [sys.executable, "-m", "backend.worker"],
                env=os.environ.copy(),
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
            )
            _worker_state.status = WorkerStatus.RUNNING
            _worker_state.pid = _worker_process.pid
            _worker_state.started_at = datetime.now()
            _worker_state.processed_count = 0
            return True
        except Exception as e:
            _worker_state.status = WorkerStatus.ERROR
            _worker_state.last_error = str(e)
            return False


def stop_worker_process() -> bool:
    """Stop the worker process gracefully."""
    global _worker_process, _worker_state

    with _worker_lock:
        if _worker_state.status not in (WorkerStatus.RUNNING, WorkerStatus.STARTING):
            return False

        _worker_state.status = WorkerStatus.STOPPING

        try:
            if _worker_process and _worker_process.poll() is None:
                _worker_process.send_signal(signal.SIGTERM)
                # Wait up to 5 seconds for graceful shutdown
                try:
                    _worker_process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    _worker_process.kill()
                    _worker_process.wait()

            _worker_state.status = WorkerStatus.STOPPED
            _worker_state.pid = None
            _worker_state.started_at = None
            _worker_process = None
            return True
        except Exception as e:
            _worker_state.status = WorkerStatus.ERROR
            _worker_state.last_error = str(e)
            return False


def restart_worker_process(convex_url: str, worker_secret: str) -> bool:
    """Restart the worker process."""
    stop_worker_process()
    time.sleep(1)  # Brief pause between stop and start
    return start_worker_process(convex_url, worker_secret)


def update_worker_metrics() -> None:
    """Update worker uptime and processed count metrics."""
    global _worker_state

    with _worker_lock:
        if _worker_state.status == WorkerStatus.RUNNING and _worker_state.started_at:
            _worker_state.uptime_seconds = (datetime.now() - _worker_state.started_at).total_seconds()


# --- Auth Dependency -------------------------------------------------------

async def verify_api_secret(authorization: Optional[str] = Header(None)) -> bool:
    """Verify API secret from Authorization header."""
    config = load_config()
    if not authorization:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing Authorization header",
        )

    if not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Authorization format (expected 'Bearer <secret>')",
        )

    token = authorization[7:]  # Remove 'Bearer ' prefix
    if token != config["api_secret"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid API secret",
        )

    return True


# --- Pydantic Models -------------------------------------------------------

class HealthResponse(BaseModel):
    """Health check response."""
    status: str = Field(..., description="Overall service health")
    worker_status: str = Field(..., description="Worker process status")
    uptime_seconds: float = Field(..., description="API server uptime")
    timestamp: str = Field(..., description="Current timestamp")


class ConfigResponse(BaseModel):
    """Current configuration response."""
    convex_url: str = Field(..., description="Convex deployment URL")
    llm_provider: str = Field(..., description="Current LLM provider")
    llm_model: Optional[str] = Field(None, description="Current LLM model")
    ollama_api_base: Optional[str] = Field(None, description="Ollama API base URL")
    ollama_timeout: Optional[int] = Field(None, description="Ollama request timeout")


class WorkerControlResponse(BaseModel):
    """Worker control operation response."""
    success: bool = Field(..., description="Operation success status")
    status: str = Field(..., description="Current worker status")
    message: str = Field(..., description="Operation result message")
    pid: Optional[int] = Field(None, description="Worker process ID")


class WorkerStatusResponse(BaseModel):
    """Worker status response."""
    status: str = Field(..., description="Worker status")
    pid: Optional[int] = Field(None, description="Worker process ID")
    started_at: Optional[str] = Field(None, description="Worker start time")
    uptime_seconds: float = Field(..., description="Worker uptime")
    processed_count: int = Field(..., description="Uploads processed")
    last_error: Optional[str] = Field(None, description="Last error message")


class QueueStatusResponse(BaseModel):
    """Convex queue status response."""
    queued_count: int = Field(..., description="Number of uploads in queue")
    processing_count: int = Field(..., description="Number of uploads being processed")
    ready_count: int = Field(..., description="Number of ready uploads")
    error_count: int = Field(..., description="Number of uploads with errors")


class LLMProviderSwitchRequest(BaseModel):
    """Request to switch LLM provider."""
    provider: str = Field(..., description="LLM provider (e.g., 'ollama', 'openai', 'anthropic')")
    model: Optional[str] = Field(None, description="Model name (provider-specific)")
    api_base: Optional[str] = Field(None, description="API base URL for custom endpoints")


class LLMProviderResponse(BaseModel):
    """LLM provider status response."""
    success: bool = Field(..., description="Operation success status")
    provider: str = Field(..., description="Current LLM provider")
    model: Optional[str] = Field(None, description="Current LLM model")
    message: str = Field(..., description="Operation result message")


class MetricsResponse(BaseModel):
    """System metrics response."""
    cpu_percent: float = Field(..., description="CPU usage percentage")
    memory_percent: float = Field(..., description="Memory usage percentage")
    memory_used_mb: float = Field(..., description="Memory used in MB")
    disk_percent: float = Field(..., description="Disk usage percentage")
    worker_uptime: float = Field(..., description="Worker process uptime")
    api_uptime: float = Field(..., description="API server uptime")
    timestamp: str = Field(..., description="Current timestamp")


# --- FastAPI App Lifecycle -------------------------------------------------

_start_time = datetime.now()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """FastAPI lifespan manager."""
    # Startup
    print("[api_server] Starting up...")
    config = load_config()
    print(f"[api_server] Config loaded: Convex URL = {config['convex_url']}")
    print(f"[api_server] API server listening on port {config['tailscale_url']}")

    # Yield control to the application
    yield

    # Shutdown
    global _shutdown_requested
    _shutdown_requested = True
    print("[api_server] Shutting down...")
    stop_worker_process()


# --- FastAPI App Setup -----------------------------------------------------

app = FastAPI(
    title="easyCV Backend API",
    description="Admin/ops API for easyCV worker control and monitoring",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS middleware for Next.js integration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, set specific origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- API Endpoints ---------------------------------------------------------

@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint."""
    update_worker_metrics()
    config = load_config()

    worker_status_str = _worker_state.status.value
    overall_status = "healthy"
    if _worker_state.status == WorkerStatus.ERROR:
        overall_status = "degraded"
    elif _worker_state.status == WorkerStatus.STOPPED:
        overall_status = "available"

    return HealthResponse(
        status=overall_status,
        worker_status=worker_status_str,
        uptime_seconds=(datetime.now() - _start_time).total_seconds(),
        timestamp=datetime.now().isoformat(),
    )


@app.get("/config", response_model=ConfigResponse)
async def get_config(authenticated: bool = Depends(verify_api_secret)):
    """Get current configuration."""
    return ConfigResponse(
        convex_url=os.environ.get("NEXT_PUBLIC_CONVEX_URL") or os.environ.get("CONVEX_URL", ""),
        llm_provider=os.environ.get("LLM_PROVIDER", "ollama"),
        llm_model=os.environ.get("LLM_MODEL"),
        ollama_api_base=os.environ.get("OLLAMA_API_BASE"),
        ollama_timeout=int(os.environ.get("OLLAMA_TIMEOUT", 60)) if os.environ.get("OLLAMA_TIMEOUT") else None,
    )


@app.post("/worker/start", response_model=WorkerControlResponse)
async def start_worker(authenticated: bool = Depends(verify_api_secret)):
    """Start the worker process."""
    config = load_config()
    convex_url = config["convex_url"] or ""
    worker_secret = config["worker_secret"] or ""

    if not convex_url:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Convex URL not configured",
        )
    if not worker_secret:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Worker secret not configured",
        )

    success = start_worker_process(convex_url, worker_secret)

    with _worker_lock:
        status_str = _worker_state.status.value
        pid = _worker_state.pid

    return WorkerControlResponse(
        success=success,
        status=status_str,
        message="Worker started successfully" if success else "Worker start failed",
        pid=pid,
    )


@app.post("/worker/stop", response_model=WorkerControlResponse)
async def stop_worker(authenticated: bool = Depends(verify_api_secret)):
    """Stop the worker process."""
    success = stop_worker_process()

    with _worker_lock:
        status_str = _worker_state.status.value

    return WorkerControlResponse(
        success=success,
        status=status_str,
        message="Worker stopped successfully" if success else "Worker stop failed",
        pid=None,
    )


@app.post("/worker/restart", response_model=WorkerControlResponse)
async def restart_worker(authenticated: bool = Depends(verify_api_secret)):
    """Restart the worker process."""
    config = load_config()
    convex_url = config["convex_url"] or ""
    worker_secret = config["worker_secret"] or ""

    if not convex_url:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Convex URL not configured",
        )
    if not worker_secret:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Worker secret not configured",
        )

    success = restart_worker_process(convex_url, worker_secret)

    with _worker_lock:
        status_str = _worker_state.status.value
        pid = _worker_state.pid

    return WorkerControlResponse(
        success=success,
        status=status_str,
        message="Worker restarted successfully" if success else "Worker restart failed",
        pid=pid,
    )


@app.get("/worker/status", response_model=WorkerStatusResponse)
async def get_worker_status(authenticated: bool = Depends(verify_api_secret)):
    """Get worker status."""
    update_worker_metrics()

    with _worker_lock:
        response = WorkerStatusResponse(
            status=_worker_state.status.value,
            pid=_worker_state.pid,
            started_at=_worker_state.started_at.isoformat() if _worker_state.started_at else None,
            uptime_seconds=_worker_state.uptime_seconds,
            processed_count=_worker_state.processed_count,
            last_error=_worker_state.last_error,
        )

    return response


@app.get("/queue/status", response_model=QueueStatusResponse)
async def get_queue_status(authenticated: bool = Depends(verify_api_secret)):
    """Get Convex upload queue status."""
    config = load_config()
    convex_url = config["convex_url"] or ""

    if not convex_url:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Convex URL not configured",
        )

    client = ConvexClient(convex_url)

    try:
        # Query queue status from Convex
        # Note: These queries need to exist in your Convex schema
        # This is a placeholder - adjust to your actual Convex queries
        queued = client.query("uploads:getQueuedCount", {})
        processing = client.query("uploads:getProcessingCount", {})
        ready = client.query("uploads:getReadyCount", {})
        errors = client.query("uploads:getErrorCount", {})

        return QueueStatusResponse(
            queued_count=queued if isinstance(queued, int) else 0,
            processing_count=processing if isinstance(processing, int) else 0,
            ready_count=ready if isinstance(ready, int) else 0,
            error_count=errors if isinstance(errors, int) else 0,
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch queue status: {str(e)}",
        )


@app.post("/llm/provider", response_model=LLMProviderResponse)
async def switch_llm_provider(
    request: LLMProviderSwitchRequest,
    authenticated: bool = Depends(verify_api_secret),
):
    """Switch LLM provider configuration."""
    try:
        # Update environment variables for the current process
        os.environ["LLM_PROVIDER"] = request.provider
        if request.model:
            os.environ["LLM_MODEL"] = request.model
        if request.api_base:
            os.environ["OLLAMA_API_BASE"] = request.api_base

        # Test the new configuration
        try:
            llm_client = LLMClient(provider=request.provider, model=request.model)
            # Simple ping to verify connectivity
            # This will vary based on provider
            return LLMProviderResponse(
                success=True,
                provider=request.provider,
                model=request.model,
                message=f"Successfully switched to {request.provider} provider",
            )
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Failed to connect to {request.provider} provider: {str(e)}",
            )

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to switch LLM provider: {str(e)}",
        )


@app.get("/metrics", response_model=MetricsResponse)
async def get_metrics(authenticated: bool = Depends(verify_api_secret)):
    """Get system and worker metrics."""
    update_worker_metrics()

    # System metrics
    cpu_percent = psutil.cpu_percent(interval=0.1)
    memory = psutil.virtual_memory()
    disk = psutil.disk_usage("/")

    return MetricsResponse(
        cpu_percent=cpu_percent,
        memory_percent=memory.percent,
        memory_used_mb=memory.used / (1024 * 1024),
        disk_percent=disk.percent,
        worker_uptime=_worker_state.uptime_seconds,
        api_uptime=(datetime.now() - _start_time).total_seconds(),
        timestamp=datetime.now().isoformat(),
    )


# --- Main Entry Point ------------------------------------------------------

def main():
    """Main entry point for the API server."""
    parser = argparse.ArgumentParser(description="HTTP API server for easyCV backend")
    parser.add_argument("--host", default="0.0.0.0", help="Host to bind to (default: 0.0.0.0)")
    parser.add_argument("--port", type=int, default=8000, help="Port to bind to (default: 8000)")
    parser.add_argument("--reload", action="store_true", help="Enable auto-reload for development")
    args = parser.parse_args()

    # Validate config
    config = load_config()

    import uvicorn

    print(f"[api_server] Starting API server on {args.host}:{args.port}")
    print(f"[api_server] Tailscale URL: {config['tailscale_url']}:{args.port}")
    print(f"[api_server] Convex URL: {config['convex_url']}")

    if args.reload:
        uvicorn.run(
            "backend.api_server:app",
            host=args.host,
            port=args.port,
            reload=True,
            log_level="info",
        )
    else:
        uvicorn.run(
            app,
            host=args.host,
            port=args.port,
            log_level="info",
        )


if __name__ == "__main__":
    main()