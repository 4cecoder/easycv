/**
 * easyCV JSON-RPC 2.0 Edge Client.
 * Communicates with local on-device Needle 2 / STE-100 edge server (http://127.0.0.1:8765/rpc)
 * for zero-cloud compute execution with fallback to browser WebGPU.
 */

export interface JsonRpcResponse<T = any> {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: T;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

export class EdgeRpcClient {
  private endpoint: string;
  private reqCounter: number = 0;

  constructor(endpoint: string = "http://127.0.0.1:8765/rpc") {
    this.endpoint = endpoint;
  }

  /**
   * Send a JSON-RPC 2.0 request.
   */
  async call<T = any>(method: string, params: Record<string, any> = {}): Promise<T> {
    const id = ++this.reqCounter;
    const body = JSON.stringify({
      jsonrpc: "2.0",
      id,
      method,
      params,
    });

    const res = await fetch(this.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body,
    });

    if (!res.ok) {
      throw new Error(`RPC HTTP Error: ${res.status} ${res.statusText}`);
    }

    const data: JsonRpcResponse<T> = await res.json();
    if (data.error) {
      throw new Error(`RPC Error [${data.error.code}]: ${data.error.message}`);
    }

    return data.result as T;
  }

  /**
   * Detect edge machine resources.
   */
  async detectResources(): Promise<{
    platform: string;
    machine: string;
    cpu_cores: number;
    needle_available: boolean;
    engine: string;
    session_ram_mb: number;
    latency_tier: string;
  }> {
    return this.call("system.detectResources");
  }

  /**
   * Extract structured profile using on-device Needle 2.
   */
  async extractProfile(text: string): Promise<{
    profile: Record<string, any>;
    confidence?: number;
    elapsed_ms: number;
    success: boolean;
  }> {
    return this.call("needle.extractProfile", { text });
  }

  /**
   * Lint bullet points against ASD-STE100 Issue 9 rules.
   */
  async lintBullets(bullets: string[]): Promise<{
    bullets: Array<{
      bullet: string;
      score: number;
      is_compliant: boolean;
      violations: Array<{ rule: string; message: string }>;
    }>;
  }> {
    return this.call("ste100.lint", { bullets });
  }

  /**
   * Render single-column LaTeX.
   */
  async renderLatex(profile: Record<string, any>, name?: string): Promise<{
    tex: string;
    name: string;
  }> {
    return this.call("latex.render", { profile, name });
  }
}

export const defaultEdgeRpcClient = new EdgeRpcClient();
