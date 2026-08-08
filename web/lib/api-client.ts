/**
 * API client for easyCV backend API server.
 * Provides type-safe methods for calling the Python backend via Tailscale.
 *
 * Usage:
 *   import { api } from '@/lib/api-client';
 *   const health = await api.health();
 *   await api.worker.start();
 */

const TAILSCALE_URL = process.env.TAILSCALE_URL || '';
const API_SECRET = process.env.API_SECRET || '';

/**
 * Generic API fetch wrapper with authentication
 */
export async function fetchAPI<T>(
  endpoint: string,
  options?: RequestInit
): Promise<T> {
  if (!TAILSCALE_URL) {
    throw new Error('TAILSCALE_URL environment variable is not set');
  }
  if (!API_SECRET) {
    throw new Error('API_SECRET environment variable is not set');
  }

  const url = `${TAILSCALE_URL}${endpoint}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_SECRET}`,
      ...options?.headers,
    },
    // Next.js server-side fetch doesn't set timeout by default
    // @ts-ignore - Next.js extended fetch options
    signal: options?.signal,
  });

  if (!response.ok) {
    const errorText = await response.text();
    let errorMessage = `API error ${response.status}`;
    try {
      const errorJson = JSON.parse(errorText);
      errorMessage += `: ${errorJson.detail || errorJson.message || errorText}`;
    } catch {
      errorMessage += `: ${errorText}`;
    }
    throw new Error(errorMessage);
  }

  return response.json();
}

// --- Type Definitions ---

export interface HealthResponse {
  status: 'healthy' | 'degraded' | 'available';
  worker_status: 'stopped' | 'starting' | 'running' | 'stopping' | 'error';
  uptime_seconds: number;
  timestamp: string;
}

export interface ConfigResponse {
  convex_url: string;
  llm_provider: string;
  llm_model?: string;
  ollama_api_base?: string;
  ollama_timeout?: number;
}

export interface WorkerControlResponse {
  success: boolean;
  status: string;
  message: string;
  pid?: number | null;
}

export interface WorkerStatusResponse {
  status: 'stopped' | 'starting' | 'running' | 'stopping' | 'error';
  pid?: number | null;
  started_at?: string;
  uptime_seconds: number;
  processed_count: number;
  last_error?: string | null;
}

export interface QueueStatusResponse {
  queued_count: number;
  processing_count: number;
  ready_count: number;
  error_count: number;
}

export interface LLMProviderSwitchRequest {
  provider: string;
  model?: string;
  api_base?: string;
}

export interface LLMProviderResponse {
  success: boolean;
  provider: string;
  model?: string;
  message: string;
}

export interface MetricsResponse {
  cpu_percent: number;
  memory_percent: number;
  memory_used_mb: number;
  disk_percent: number;
  worker_uptime: number;
  api_uptime: number;
  timestamp: string;
}

// --- API Client ---

/**
 * Main API client with typed methods for all endpoints
 */
export const api = {
  /**
   * Health check (no authentication required)
   */
  health: (): Promise<HealthResponse> => fetchAPI('/health'),

  /**
   * Get current configuration
   */
  config: (): Promise<ConfigResponse> => fetchAPI('/config'),

  /**
   * Worker control operations
   */
  worker: {
    start: (): Promise<WorkerControlResponse> =>
      fetchAPI('/worker/start', { method: 'POST' }),

    stop: (): Promise<WorkerControlResponse> =>
      fetchAPI('/worker/stop', { method: 'POST' }),

    restart: (): Promise<WorkerControlResponse> =>
      fetchAPI('/worker/restart', { method: 'POST' }),

    status: (): Promise<WorkerStatusResponse> =>
      fetchAPI('/worker/status'),
  },

  /**
   * Queue monitoring
   */
  queue: {
    status: (): Promise<QueueStatusResponse> =>
      fetchAPI('/queue/status'),
  },

  /**
   * LLM provider management
   */
  llm: {
    switchProvider: (data: LLMProviderSwitchRequest): Promise<LLMProviderResponse> =>
      fetchAPI('/llm/provider', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
  },

  /**
   * System metrics
   */
  metrics: (): Promise<MetricsResponse> => fetchAPI('/metrics'),
};

export default api;