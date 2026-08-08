# easyCV Backend API Server - Quick Start Guide

Get the Python HTTP API server running and connected to your Next.js app via Tailscale in 5 minutes.

## Prerequisites

- Tailscale installed and running on your Gentoo host
- uv package manager installed
- Next.js app configured with environment variables

## Step 1: Install Dependencies

```bash
cd /home/fource/bytecats/projects/web/easycv
uv sync
```

This will install FastAPI, Uvicorn, Pydantic, and psutil.

## Step 2: Configure Environment Variables

Add these to `web/.env.local`:

```bash
# API Server Configuration
API_SECRET=your-random-api-secret-here-change-this
TAILSCALE_URL=https://gentoo.tail125a6c.ts.net:8000

# Convex Configuration
NEXT_PUBLIC_CONVEX_URL=https://your-convex-app.convex.cloud
WORKER_SECRET=your-convex-worker-secret-here

# LLM Configuration
LLM_PROVIDER=ollama
LLM_MODEL=llama3.1
OLLAMA_API_BASE=http://192.168.1.135:11434
OLLAMA_TIMEOUT=60
```

**Generate a secure API_SECRET:**
```bash
openssl rand -hex 32
```

## Step 3: Start the API Server

### Development (with auto-reload)
```bash
uv run python -m backend.api_server --host 0.0.0.0 --port 8000 --reload
```

### Production
```bash
uv run python -m backend.api_server --host 0.0.0.0 --port 8000
```

You should see:
```
[api_server] Starting up...
[api_server] Config loaded: Convex URL = https://your-convex-app.convex.cloud
[api_server] API server listening on port https://gentoo.tail125a6c.ts.net:8000
INFO:     Uvicorn running on http://0.0.0.0:8000 (Press CTRL+C to quit)
```

## Step 4: Test the API Server

```bash
# Health check (no auth needed)
curl http://localhost:8000/health

# With authentication
curl -H "Authorization: Bearer your-api-secret" http://localhost:8000/config
```

## Step 5: Configure Next.js

Add to your Netlify environment variables or `.env.local`:

```bash
TAILSCALE_URL=https://gentoo.tail125a6c.ts.net:8000
API_SECRET=your-random-api-secret-here-change-this
```

## Step 6: Use the API Client

```typescript
// web/app/admin/page.tsx
'use client';

import { api } from '@/lib/api-client';

export default function AdminPage() {
  const startWorker = async () => {
    try {
      const result = await api.worker.start();
      alert(result.message);
    } catch (error) {
      alert(`Failed: ${error}`);
    }
  };

  return (
    <div>
      <h1>Admin Dashboard</h1>
      <button onClick={startWorker}>Start Worker</button>
    </div>
  );
}
```

## Step 7: Deploy as Systemd Service (Production)

```bash
# Install the systemd service
sudo cp systemd/easycv-api.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable easycv-api
sudo systemctl start easycv-api

# Check status
sudo systemctl status easycv-api

# View logs
sudo journalctl -u easycv-api -f
```

## API Endpoints Overview

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/health` | GET | No | Health check |
| `/config` | GET | Yes | Get configuration |
| `/worker/start` | POST | Yes | Start worker |
| `/worker/stop` | POST | Yes | Stop worker |
| `/worker/restart` | POST | Yes | Restart worker |
| `/worker/status` | GET | Yes | Worker status |
| `/queue/status` | GET | Yes | Queue metrics |
| `/llm/provider` | POST | Yes | Switch LLM |
| `/metrics` | GET | Yes | System metrics |

## Troubleshooting

### Connection Refused
```bash
# Check if server is running
curl http://localhost:8000/health

# Check Tailscale status
tailscale status

# Check firewall
sudo iptables -L | grep 8000
```

### Authentication Failed
```bash
# Verify API_SECRET matches
echo $API_SECRET
# Should match the value in web/.env.local
```

### Worker Won't Start
```bash
# Check logs
sudo journalctl -u easycv-api -f

# Verify Convex connection
curl https://your-convex-app.convex.cloud
```

### Port Already in Use
```bash
# Find process using port 8000
sudo lsof -i :8000

# Kill the process
sudo kill <PID>
```

## Next Steps

1. **Build admin UI** - Create full dashboard with React hooks
2. **Add Convex queries** - Implement queue status queries
3. **Set up monitoring** - Add Prometheus/Grafana integration
4. **Configure CORS** - Restrict origins for production
5. **Add rate limiting** - Implement API rate limiting
6. **Enable HTTPS** - Use Tailscale's built-in encryption

## Full Documentation

See `docs/API_SERVER.md` for complete API reference, security guidelines, and Convex schema requirements.

## Support

- **Logs:** `sudo journalctl -u easycv-api -f`
- **Test locally:** `curl http://localhost:8000/health`
- **Check Tailscale:** `tailscale status`
- **Review docs:** `docs/API_SERVER.md`