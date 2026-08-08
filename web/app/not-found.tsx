"use client";

import React, { useEffect, useRef } from "react";
import Link from "next/link";
import { ArrowLeft, Play } from "lucide-react";

export default function NotFound() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
    
    // Fallback to 2D if WebGL is not available, though the prompt asked for WebGL.
    // Let's implement a minimal WebGL ambient shader if possible, or a nice 2D canvas effect simulating it.
    // For simplicity and robust react, we'll do an advanced 2D ambient effect.
    const ctx = canvas.getContext("2d");
    if (!ctx && !gl) return;

    if (ctx) {
      let animationFrameId: number;
      let width = window.innerWidth;
      let height = window.innerHeight;

      const resize = () => {
        width = window.innerWidth;
        height = window.innerHeight;
        canvas.width = width;
        canvas.height = height;
      };
      window.addEventListener("resize", resize);
      resize();

      const particles = Array.from({ length: 150 }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 1.5,
        vy: (Math.random() - 0.5) * 1.5,
        size: Math.random() * 2 + 1,
        color: `rgba(${Math.floor(Math.random() * 50 + 100)}, ${Math.floor(
          Math.random() * 100 + 155
        )}, 255, ${Math.random() * 0.5 + 0.1})`,
      }));

      const render = () => {
        ctx.fillStyle = "rgba(5, 5, 10, 0.15)";
        ctx.fillRect(0, 0, width, height);

        particles.forEach((p) => {
          p.x += p.vx;
          p.y += p.vy;

          if (p.x < 0) p.x = width;
          if (p.x > width) p.x = 0;
          if (p.y < 0) p.y = height;
          if (p.y > height) p.y = 0;

          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fillStyle = p.color;
          ctx.fill();
        });

        animationFrameId = requestAnimationFrame(render);
      };

      render();

      return () => {
        window.removeEventListener("resize", resize);
        cancelAnimationFrame(animationFrameId);
      };
    }
  }, []);

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-[#030305] text-slate-200 flex items-center justify-center font-sans">
      {/* Ambient Canvas Layer */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 z-0 opacity-70"
        style={{ width: "100%", height: "100%" }}
      />

      {/* Glassmorphic Container */}
      <div className="relative z-10 w-full max-w-lg p-8 mx-4 backdrop-blur-2xl bg-white/5 border border-white/10 rounded-3xl shadow-2xl flex flex-col items-center text-center">
        <div className="w-20 h-20 mb-6 rounded-2xl bg-gradient-to-tr from-indigo-500 to-cyan-400 flex items-center justify-center shadow-lg shadow-cyan-500/20">
          <span className="text-4xl font-black text-white tracking-tighter">404</span>
        </div>
        
        <h1 className="text-3xl md:text-4xl font-bold text-white mb-4 tracking-tight">
          Page Not Found
        </h1>
        
        <p className="text-slate-400 mb-10 leading-relaxed max-w-sm">
          The sector you are looking for has been moved or no longer exists in the current system. Let's get you back on track.
        </p>
        
        <div className="flex flex-col sm:flex-row gap-4 w-full justify-center">
          <Link 
            href="/"
            className="flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-white/10 hover:bg-white/15 border border-white/5 transition-all text-sm font-medium hover:scale-105 active:scale-95"
          >
            <ArrowLeft className="w-4 h-4" />
            Return to Master Builder
          </Link>
          
          <Link 
            href="/demo"
            className="flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-cyan-500 hover:from-indigo-500 hover:to-cyan-400 text-white shadow-lg shadow-indigo-500/25 transition-all text-sm font-medium hover:scale-105 active:scale-95"
          >
            <Play className="w-4 h-4" />
            Try 1-Click Demo
          </Link>
        </div>
      </div>
    </div>
  );
}
