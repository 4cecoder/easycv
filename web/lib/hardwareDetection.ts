/**
 * Hardware and Environment Detection Utility for easyCV.
 * Detects WebGPU, WebGL GPU renderer, CPU concurrency, device memory,
 * and computes dynamic processing ETAs for on-device and edge LLM pipelines.
 */

export interface HardwareProfile {
  hasWebGPU: boolean;
  gpuRenderer: string;
  gpuVendor: string;
  cpuCores: number;
  deviceMemoryGb: number;
  networkType: string;
  hardwareTier: "ultra" | "high" | "medium" | "low";
  estimatedPipelineDurationMs: number;
  engineName: string;
}

export async function detectHardwareProfile(): Promise<HardwareProfile> {
  const cpuCores = typeof navigator !== "undefined" && navigator.hardwareConcurrency ? navigator.hardwareConcurrency : 4;
  // @ts-ignore - deviceMemory is experimental
  const deviceMemoryGb = typeof navigator !== "undefined" && navigator.deviceMemory ? navigator.deviceMemory : 8;

  // @ts-ignore - NetworkInformation API
  const connection = typeof navigator !== "undefined" ? (navigator.connection || navigator.mozConnection || navigator.webkitConnection) : null;
  const networkType = connection && connection.effectiveType ? connection.effectiveType.toUpperCase() : "4G";

  let hasWebGPU = false;
  let gpuRenderer = "Integrated Graphics";
  let gpuVendor = "Generic";

  // 1. Check WebGPU
  if (typeof navigator !== "undefined" && "gpu" in navigator) {
    try {
      const adapter = await navigator.gpu.requestAdapter();
      if (adapter) {
        hasWebGPU = true;
        // @ts-ignore
        if (adapter.info) {
          // @ts-ignore
          gpuVendor = adapter.info.vendor || "WebGPU";
          // @ts-ignore
          gpuRenderer = adapter.info.architecture || adapter.info.device || "WebGPU Hardware Accelerator";
        }
      }
    } catch {
      hasWebGPU = false;
    }
  }

  // 2. WebGL Fallback GPU Detection
  if (typeof document !== "undefined" && gpuRenderer === "Integrated Graphics") {
    try {
      const canvas = document.createElement("canvas");
      const gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
      if (gl) {
        const debugInfo = (gl as WebGLRenderingContext).getExtension("WEBGL_debug_renderer_info");
        if (debugInfo) {
          gpuVendor = (gl as WebGLRenderingContext).getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) || gpuVendor;
          gpuRenderer = (gl as WebGLRenderingContext).getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || gpuRenderer;
        }
      }
    } catch {
      // Ignore WebGL detection error
    }
  }

  // 3. Classify Hardware Tier & Compute Expected Pipeline Duration
  let hardwareTier: "ultra" | "high" | "medium" | "low" = "medium";
  let estimatedPipelineDurationMs = 5500; // Base 5.5s

  const isAppleSilicon = /Apple/i.test(gpuRenderer) || /Apple/i.test(gpuVendor);
  const isDedicatedGpu = /NVIDIA|RTX|GeForce|Radeon|AMD/i.test(gpuRenderer);

  if (hasWebGPU && (isAppleSilicon || isDedicatedGpu) && cpuCores >= 8) {
    hardwareTier = "ultra";
    estimatedPipelineDurationMs = 2800; // ~2.8s
  } else if ((hasWebGPU || isAppleSilicon || isDedicatedGpu) && cpuCores >= 6) {
    hardwareTier = "high";
    estimatedPipelineDurationMs = 3800; // ~3.8s
  } else if (cpuCores >= 4 && deviceMemoryGb >= 4) {
    hardwareTier = "medium";
    estimatedPipelineDurationMs = 5500; // ~5.5s
  } else {
    hardwareTier = "low";
    estimatedPipelineDurationMs = 8500; // ~8.5s
  }

  // Adjust slightly based on network if downloading model weights
  if (networkType === "3G") {
    estimatedPipelineDurationMs += 2500;
  } else if (networkType === "2G" || networkType === "SLOW-2G") {
    estimatedPipelineDurationMs += 6000;
  }

  const engineName = hasWebGPU
    ? "Needle 2 + WebGPU Acceleration"
    : isAppleSilicon
    ? "Needle 2 (NEON/Metal Optimized)"
    : "Needle 2 On-Device Engine";

  return {
    hasWebGPU,
    gpuRenderer,
    gpuVendor,
    cpuCores,
    deviceMemoryGb,
    networkType,
    hardwareTier,
    estimatedPipelineDurationMs,
    engineName,
  };
}
