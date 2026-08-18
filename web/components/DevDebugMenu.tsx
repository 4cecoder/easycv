"use client";

import React, { useState, useEffect } from "react";
import {
  Terminal,
  Cpu,
  Zap,
  Activity,
  Trash2,
  ChevronUp,
  ChevronDown,
  RefreshCw,
  Server,
  Sparkles,
  CheckCircle2,
  XCircle,
  FileCode,
  Wifi,
  Copy,
  Check
} from "lucide-react";
import { detectHardwareProfile, type HardwareProfile } from "../lib/hardwareDetection";

export const DevDebugMenu: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [hardware, setHardware] = useState<HardwareProfile | null>(null);
  const [rpcStatus, setRpcStatus] = useState<"checking" | "online" | "offline">("checking");
  const [convexStatus, setConvexStatus] = useState<"checking" | "online" | "offline">("checking");
  const [pingMs, setPingMs] = useState<number | null>(null);
  const [lanInfo, setLanInfo] = useState<{ lanIp: string; networkUrl: string } | null>(null);
  const [copiedLan, setCopiedLan] = useState(false);

  useEffect(() => {
    // Detect hardware profile
    detectHardwareProfile().then(setHardware);

    // Fetch LAN IP for mobile network testing
    fetch("/api/dev/lan-ip")
      .then((res) => res.json())
      .then((data) => {
        if (data?.networkUrl) {
          setLanInfo(data);
        }
      })
      .catch(() => {});

    // Probe Convex health
    const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL || "http://127.0.0.1:3210";
    fetch(convexUrl, { method: "HEAD" })
      .then((res) => {
        setConvexStatus(res.ok || res.status < 500 ? "online" : "offline");
      })
      .catch(() => setConvexStatus("offline"));

    // Probe JSON-RPC health
    const t0 = performance.now();
    fetch("http://127.0.0.1:8765/rpc", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "system.detectResources", params: {} })
    })
      .then((res) => res.json())
      .then((data) => {
        setPingMs(Math.round(performance.now() - t0));
        setRpcStatus(data?.result ? "online" : "offline");
      })
      .catch(() => {
        setRpcStatus("offline");
      });
  }, []);

  const handleCopyLan = () => {
    if (lanInfo?.networkUrl) {
      navigator.clipboard.writeText(lanInfo.networkUrl);
      setCopiedLan(true);
      setTimeout(() => setCopiedLan(false), 2000);
    }
  };

  // Only render in local development
  if (process.env.NODE_ENV === "production") {
    return null;
  }

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 font-sans text-xs select-none">
      {/* Collapsed Badge Pill */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="flex items-center gap-2 rounded-full border border-border/80 bg-card/95 backdrop-blur-md px-3.5 py-2 text-foreground shadow-xl transition-all hover:border-primary/50 hover:bg-accent/80 active:scale-95 group"
        >
          <span className="flex size-2 rounded-full bg-emerald-500 animate-pulse" />
          <Terminal className="size-3.5 text-primary group-hover:rotate-12 transition-transform" />
          <span className="font-mono font-semibold tracking-tight">DEV TOOLS</span>
          {lanInfo?.lanIp && (
            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground flex items-center gap-1">
              <Wifi className="size-2.5" />
              {lanInfo.lanIp}
            </span>
          )}
          <ChevronUp className="size-3 text-muted-foreground" />
        </button>
      )}

      {/* Expanded Dev Panel */}
      {isOpen && (
        <div className="flex w-92 flex-col rounded-xl border border-border bg-card/98 p-4 shadow-2xl backdrop-blur-xl animate-in slide-in-from-bottom-3 duration-200">
          {/* Header */}
          <div className="flex items-center justify-between pb-3 border-b border-border">
            <div className="flex items-center gap-2">
              <div className="rounded-md bg-primary/10 p-1.5 text-primary">
                <Terminal className="size-4" />
              </div>
              <div>
                <span className="font-bold text-foreground tracking-tight">easyCV Dev Inspector</span>
                <span className="block text-[10px] font-mono text-muted-foreground">localhost:3000</span>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <ChevronDown className="size-4" />
            </button>
          </div>

          {/* Network & LAN Host Address */}
          {lanInfo?.networkUrl && (
            <div className="my-2.5 rounded-lg border border-primary/25 bg-primary/[0.04] p-2.5 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <div className="flex size-6 items-center justify-center rounded bg-primary/10 text-primary shrink-0">
                  <Wifi className="size-3.5" />
                </div>
                <div className="min-w-0">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
                    LAN Mobile Access
                  </span>
                  <span className="font-mono text-xs font-semibold text-foreground truncate block">
                    {lanInfo.networkUrl}
                  </span>
                </div>
              </div>
              <button
                onClick={handleCopyLan}
                className="flex items-center gap-1 rounded bg-muted/60 hover:bg-muted px-2 py-1 text-[11px] font-medium text-foreground transition-colors shrink-0"
                title="Copy LAN URL"
              >
                {copiedLan ? <Check className="size-3 text-emerald-400" /> : <Copy className="size-3" />}
                <span>{copiedLan ? "Copied" : "Copy"}</span>
              </button>
            </div>
          )}

          {/* Backend & Edge Services Probe */}
          <div className="mb-3 space-y-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Local Service Probes
            </span>
            <div className="grid grid-cols-2 gap-2">
              {/* Convex Status */}
              <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 p-2 text-[11px]">
                <div className="flex items-center gap-1.5 min-w-0">
                  <Server className="size-3 text-muted-foreground shrink-0" />
                  <span className="truncate">Convex DB</span>
                </div>
                {convexStatus === "online" ? (
                  <span className="flex items-center gap-1 text-emerald-400 font-semibold text-[10px]">
                    <CheckCircle2 className="size-3" /> 3210
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-amber-500 font-semibold text-[10px]">
                    <Activity className="size-3 animate-spin" /> Off
                  </span>
                )}
              </div>

              {/* JSON-RPC Edge Status */}
              <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 p-2 text-[11px]">
                <div className="flex items-center gap-1.5 min-w-0">
                  <Zap className="size-3 text-muted-foreground shrink-0" />
                  <span className="truncate">Edge Engine RPC</span>
                </div>
                {rpcStatus === "online" ? (
                  <span className="flex items-center gap-1 text-emerald-400 font-semibold text-[10px]">
                    <CheckCircle2 className="size-3" /> {pingMs}ms
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-muted-foreground text-[10px]">
                    CPU Mode
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Detected Hardware Specs */}
          <div className="mb-3 space-y-1.5 rounded-lg border border-border bg-muted/20 p-2.5 font-mono text-[11px]">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">LAN IP:</span>
              <span className="font-semibold text-foreground font-mono">
                {lanInfo?.lanIp || "Detecting..."}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">GPU / Renderer:</span>
              <span className="font-semibold text-foreground truncate max-w-[140px]">
                {hardware?.gpuRenderer || "Detecting..."}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Hardware Acceleration:</span>
              <span className={hardware?.hasWebGPU ? "text-emerald-400 font-bold" : "text-amber-400 font-bold"}>
                {hardware?.hasWebGPU ? "ACTIVE" : "CPU FALLBACK"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Logical CPU Cores:</span>
              <span className="font-semibold text-foreground">{hardware?.cpuCores || 4} Cores</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Base Pipeline ETA:</span>
              <span className="font-semibold text-foreground">
                {((hardware?.estimatedPipelineDurationMs || 5000) / 1000).toFixed(1)}s
              </span>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="space-y-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Developer Actions
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  window.location.reload();
                }}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-md border border-border bg-muted/40 py-1.5 text-[11px] font-medium text-foreground hover:bg-muted transition-colors active:scale-95"
              >
                <RefreshCw className="size-3 text-muted-foreground" /> Reload
              </button>
              <button
                onClick={() => {
                  localStorage.clear();
                  sessionStorage.clear();
                  window.location.href = "/";
                }}
                className="flex items-center justify-center gap-1.5 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-1.5 text-[11px] font-medium text-destructive hover:bg-destructive/20 transition-colors active:scale-95"
                title="Clear local session storage"
              >
                <Trash2 className="size-3" /> Reset
              </button>
            </div>
          </div>

          {/* Footer note */}
          <div className="mt-3 text-center">
            <span className="text-[9px] font-mono text-muted-foreground">
              Local Dev Mode Only &bull; Zero Production Footprint
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
