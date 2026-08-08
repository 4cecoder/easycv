# easyCV Backend API Server Documentation

HTTP API server for easyCV backend admin/ops operations. Exposes endpoints for worker control, LLM provider switching, metrics, and health monitoring. Designed to be called from Next.js via Tailscale.

## Overview

The API server (`backend/api_server.py`) provides a RESTful interface for managing the easyCV backend worker process and monitoring system health. It runs on your Gentoo host and is accessible via Tailscale network.

**Key Features:**
- Health checks and system monitoring
- Worker process control (start/stop/restart/status)
- Convex queue status monitoring
- LLM provider switching
- System metrics (CPU, memory, disk)
- Bearer token authentication

## Architecture

```
Next.js (Netlify) → Tailscale → API Server (Gentoo:8000) → Worker Process
                                            ↓
                                      Convex DB
```

## Configuration

### Environment Variables

Configure in `web/.env.local`:

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `API_SECRET` | Yes | Shared secret for API authentication | `your-random-api-secret-here` |
| `TAILSCALE_URL` | No | Tailscale network URL (for logging) | `gentoo.tail125a6c.ts.net` |
| `NEXT_PUBLIC_CONVEX_URL` | Yes | Convex deployment URL | `https://friendly-panda-123.convex.cloud` |
| `WORKER_SECRET` | Yes | Secret for Convex worker mutations | `your-worker-secret-here` |
| `LLM_PROVIDER` | No | LLM provider (`ollama`, `openai`, `anthropic`) | `ollama` |
| `LLM_MODEL` | No | Model name | `llama3.1` |
| `OLLAMA_API_BASE` | No | Ollama API base URL | `http://192.168.1.135:11434` |
| `OLLAMA_TIMEOUT` | No | Ollama request timeout (seconds) | `60` |

### Port and Host

- **Default Port:** `8000`
- **Default Host:** `0.0.0.0` (all interfaces)
- **Tailscale Access:** `http://gentoo.tail125a6c.ts.net:8000`

### Next.js Configuration

Set this in your Next.js environment (Netlify):

```bash
TAILSCALE_URL=https://gentoo.tail125a6c.ts.net:8000
API_SECRET=your-random-api-secret-here
```

## Authentication

All admin endpoints require Bearer token authentication:

```bash
Authorization: Bearer <API_SECRET>
```

The `API_SECRET` must match between the API server and Next.js application.

## API Endpoints

### Health Check

**Endpoint:** `GET /health`

**Authentication:** Not required

**Response:**
```json
{
  "status": "healthy",
  "worker_status": "running",
  "uptime_seconds": 1234.56,
  "timestamp": "2024-08-08T12:34:56.789"
}
```

**Status Values:**
- `healthy` - All systems operational
- `degraded` - Worker in error state
- `available` - Worker stopped but API functional

---

### Get Configuration

**Endpoint:** `GET /config`

**Authentication:** Required

**Response:**
```json
{
  "convex_url": "https://friendly-panda-123.convex.cloud",
  "llm_provider": "ollama",
  "llm_model": "llama3.1",
  "ollama_api_base": "http://192.168.1.135:11434",
  "ollama_timeout": 60
}
```

---

### Worker Control

#### Start Worker

**Endpoint:** `POST /worker/start`

**Authentication:** Required

**Response:**
```json
{
  "success": true,
  "status": "running",
  "message": "Worker started successfully",
  "pid": 12345
}
```

#### Stop Worker

**Endpoint:** `POST /worker/stop`

**Authentication:** Required

**Response:**
```json
{
  "success": true,
  "status": "stopped",
  "message": "Worker stopped successfully",
  "pid": null
}
```

#### Restart Worker

**Endpoint:** `POST /worker/restart`

**Authentication:** Required

**Response:**
```json
{
  "success": true,
  "status": "running",
  "message": "Worker restarted successfully",
  "pid": 12346
}
```

#### Get Worker Status

**Endpoint:** `GET /worker/status`

**Authentication:** Required

**Response:**
```json
{
  "status": "running",
  "pid": 12345,
  "started_at": "2024-08-08T12:00:00.000",
  "uptime_seconds": 2345.67,
  "processed_count": 42,
  "last_error": null
}
```

**Status Values:**
- `stopped` - Worker not running
- `starting` - Worker starting up
- `running` - Worker operational
- `stopping` - Worker shutting down
- `error` - Worker encountered error

---

### Queue Status

**Endpoint:** `GET /queue/status`

**Authentication:** Required

**Response:**
```json
{
  "queued_count": 5,
  "processing_count": 1,
  "ready_count": 42,
  "error_count": 0
}
```

**Note:** This endpoint requires Convex queries to exist in your schema. Adjust query names as needed.

---

### LLM Provider Switch

**Endpoint:** `POST /llm/provider`

**Authentication:** Required

**Request Body:**
```json
{
  "provider": "ollama",
  "model": "llama3.1",
  "api_base": "http://192.168.1.135:11434"
}
```

**Response:**
```json
{
  "success": true,
  "provider": "ollama",
  "model": "llama3.1",
  "message": "Successfully switched to ollama provider"
}
```

**Supported Providers:**
- `ollama` - Local Ollama instance
- `openai` - OpenAI API
- `anthropic` - Anthropic Claude API

---

### System Metrics

**Endpoint:** `GET /metrics`

**Authentication:** Required

**Response:**
```json
{
  "cpu_percent": 15.5,
  "memory_percent": 45.2,
  "memory_used_mb": 734.2,
  "disk_percent": 62.8,
  "worker_uptime": 2345.67,
  "api_uptime": 12345.67,
  "timestamp": "2024-08-08T12:34:56.789"
}
```

## Next.js Integration

### 1. Environment Setup

In your Next.js `.env.local` or Netlify environment variables:

```bash
TAILSCALE_URL=https://gentoo.tail125a6c.ts.net:8000
API_SECRET=your-random-api-secret-here
```

### 2. API Client Helper

Create `lib/api-client.ts`:

```typescript
const TAILSCALE_URL = process.env.TAILSCALE_URL || '';
const API_SECRET = process.env.API_SECRET || '';

export async function fetchAPI<T>(
  endpoint: string,
  options?: RequestInit
): Promise<T> {
  const url = `${TAILSCALE_URL}${endpoint}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_SECRET}`,
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`API error ${response.status}: ${error}`);
  }

  return response.json();
}

// Convenience functions
export const api = {
  health: () => fetchAPI('/health'),
  config: () => fetchAPI('/config'),
  worker: {
    start: () => fetchAPI('/worker/start', { method: 'POST' }),
    stop: () => fetchAPI('/worker/stop', { method: 'POST' }),
    restart: () => fetchAPI('/worker/restart', { method: 'POST' }),
    status: () => fetchAPI('/worker/status'),
  },
  queue: {
    status: () => fetchAPI('/queue/status'),
  },
  llm: {
    switchProvider: (data: { provider: string; model?: string; api_base?: string }) =>
      fetchAPI('/llm/provider', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
  },
  metrics: () => fetchAPI('/metrics'),
};
```

### 3. Usage Example

```typescript
'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api-client';

export default function AdminDashboard() {
  const [health, setHealth] = useState<any>(null);
  const [workerStatus, setWorkerStatus] = useState<any>(null);

  useEffect(() => {
    // Fetch health (no auth needed)
    api.health().then(setHealth).catch(console.error);
  }, []);

  const startWorker = async () => {
    try {
      const result = await api.worker.start();
      alert(result.message);
      setWorkerStatus(result);
    } catch (error) {
      alert(`Failed to start worker: ${error}`);
    }
  };

  return (
    <div>
      <h1>Admin Dashboard</h1>
      {health && (
        <div>
          <h2>System Health</h2>
          <p>Status: {health.status}</p>
          <p>Worker: {health.worker_status}</p>
        </div>
      )}
      <button onClick={startWorker}>Start Worker</button>
    </div>
  );
}
```

## Running the API Server

### Development

```bash
cd /home/fource/bytecats/projects/web/easycv
uv run python -m backend.api_server --host 0.0.0.0 --port 8000 --reload
```

### Production

```bash
# Using systemd
sudo systemctl start easycv-api

# Or manually
uv run python -m backend.api_server --host 0.0.0.0 --port 8000
```

### Docker Deployment

Create `Dockerfile.api`:

```dockerfile
FROM python:3.13-slim

WORKDIR /app
COPY . .

RUN pip install uv && uv sync

EXPOSE 8000
CMD ["uv", "run", "python", "-m", "backend.api_server", "--host", "0.0.0.0", "--port", "8000"]
```

## Troubleshooting

### Connection Refused

- Verify Tailscale is running: `tailscale status`
- Check firewall rules: `sudo iptables -L | grep 8000`
- Ensure API server is running: `curl http://localhost:8000/health`

### Authentication Failed

- Verify `API_SECRET` matches between API server and Next.js
- Check Authorization header format: `Bearer <secret>`

### Worker Won't Start

- Check Convex URL and WORKER_SECRET are set
- Review worker logs: `journalctl -u easycv-worker -f`
- Verify Python dependencies: `uv sync`

### Queue Status Errors

- Ensure Convex queries exist in your schema
- Check Convex client authentication
- Verify network connectivity to Convex

## Security Considerations

1. **Always use HTTPS in production** - Tailscale provides encryption
2. **Rotate API_SECRET regularly** - Use strong, random secrets
3. **Restrict Tailscale network access** - Only trusted devices
4. **Monitor access logs** - Track API usage patterns
5. **Use rate limiting** - Prevent abuse (add middleware)
6. **CORS restrictions** - Set specific origins in production

## API Reference

All endpoints return JSON responses with appropriate HTTP status codes:

- `200 OK` - Successful GET requests
- `201 Created` - Successful POST/PUT/DELETE
- `400 Bad Request` - Invalid request parameters
- `401 Unauthorized` - Missing authentication
- `403 Forbidden` - Invalid credentials
- `404 Not Found` - Endpoint not found
- `500 Internal Server Error` - Server error

## Convex Schema Requirements

For the queue status endpoint to work, add these queries to your Convex schema:

```typescript
// convex/uploads.ts
export const getQueuedCount = query({
  args: {},
  handler: async (ctx) => {
    const uploads = await ctx.db
      .query("uploads")
      .withIndex("by_status", q => q.eq("status", "queued"))
      .collect();
    return uploads.length;
  },
});

export const getProcessingCount = query({
  args: {},
  handler: async (ctx) => {
    const uploads = await ctx.db
      .query("uploads")
      .withIndex("by_status", q => q.eq("status", "processing"))
      .collect();
    return uploads.length;
  },
});

export const getReadyCount = query({
  args: {},
  handler: async (ctx) => {
    const uploads = await ctx.db
      .query("uploads")
      .withIndex("by_status", q => q.eq("status", "ready"))
      .collect();
    return uploads.length;
  },
});

export const getErrorCount = query({
  args: {},
  handler: async (ctx) => {
    const uploads = await ctx.db
      .query("uploads")
      .withIndex("by_status", q => q.eq("status", "error"))
      .collect();
    return uploads.length;
  },
});
```

## Next Steps

1. **Add Convex queries** - Implement the queue status queries
2. **Set up systemd service** - Create systemd unit files for auto-start
3. **Add monitoring** - Integrate with Prometheus/Grafana
4. **Implement rate limiting** - Add middleware for API protection
5. **Add webhook support** - Notify Next.js on worker events
6. **Create admin UI** - Build comprehensive admin dashboard

## Support

For issues or questions:
- Check logs: `journalctl -u easycv-api -f`
- Verify Tailscale: `tailscale status`
- Test endpoints: `curl http://localhost:8000/health`
- Review Convex dashboard for DB issues