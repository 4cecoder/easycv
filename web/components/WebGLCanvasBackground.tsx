'use client';

import React, { useEffect, useRef } from 'react';

export default function WebGLCanvasBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    // Use alpha: false to optimize performance if we draw our own background
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    let animationFrameId: number;
    let width = 0;
    let height = 0;
    let time = 0;

    const mouse = { x: -1000, y: -1000 };
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Constellation Particles
    class Particle {
      x: number;
      y: number;
      vx: number;
      vy: number;
      radius: number;

      constructor(x: number, y: number) {
        this.x = x;
        this.y = y;
        this.vx = (Math.random() - 0.5) * 1.2;
        this.vy = (Math.random() - 0.5) * 1.2;
        this.radius = Math.random() * 1.5 + 0.5;
      }

      update() {
        if (prefersReducedMotion) return;
        this.x += this.vx;
        this.y += this.vy;

        if (this.x < 0 || this.x > width) this.vx *= -1;
        if (this.y < 0 || this.y > height) this.vy *= -1;

        // Mouse repulsion
        const dx = mouse.x - this.x;
        const dy = mouse.y - this.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const maxDist = 180;

        if (distance < maxDist) {
          const force = (maxDist - distance) / maxDist;
          this.x -= (dx / distance) * force * 2.5;
          this.y -= (dy / distance) * force * 2.5;
        }
      }

      draw(ctx: CanvasRenderingContext2D) {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.fill();
      }
    }

    // Metaballs / Organic Orbs
    class Orb {
      x: number;
      y: number;
      radius: number;
      baseRadius: number;
      color: string;
      vx: number;
      vy: number;
      phase: number;

      constructor(x: number, y: number, radius: number, color: string) {
        this.x = x;
        this.y = y;
        this.baseRadius = radius;
        this.radius = radius;
        this.color = color;
        this.vx = (Math.random() - 0.5) * 0.8;
        this.vy = (Math.random() - 0.5) * 0.8;
        this.phase = Math.random() * Math.PI * 2;
      }

      update(t: number) {
        if (prefersReducedMotion) return;
        this.x += this.vx;
        this.y += this.vy;
        
        // Morphing effect
        this.radius = this.baseRadius + Math.sin(this.phase + t * 0.002) * (this.baseRadius * 0.2);

        if (this.x < -this.radius) this.vx = Math.abs(this.vx);
        if (this.x > width + this.radius) this.vx = -Math.abs(this.vx);
        if (this.y < -this.radius) this.vy = Math.abs(this.vy);
        if (this.y > height + this.radius) this.vy = -Math.abs(this.vy);
      }

      draw(ctx: CanvasRenderingContext2D) {
        ctx.beginPath();
        const gradient = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.radius);
        gradient.addColorStop(0, this.color);
        gradient.addColorStop(1, 'transparent');
        ctx.fillStyle = gradient;
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    let particles: Particle[] = [];
    let orbs: Orb[] = [];

    const init = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width;
      canvas.height = height;

      particles = [];
      // Adjust particle count based on screen size for performance
      const numParticles = Math.min((width * height) / 12000, 120);
      for (let i = 0; i < numParticles; i++) {
        particles.push(new Particle(Math.random() * width, Math.random() * height));
      }

      orbs = [];
      const orbColors = [
        'rgba(0, 255, 255, 0.15)',   // cyan
        'rgba(128, 0, 255, 0.15)',   // purple
        'rgba(0, 255, 128, 0.15)',   // emerald
        'rgba(0, 128, 255, 0.15)',   // electric blue
      ];
      // 8 orbs to create complex metaball-like overlapping
      for (let i = 0; i < 8; i++) {
        orbs.push(new Orb(
          Math.random() * width,
          Math.random() * height,
          Math.random() * 200 + 200, // Large radius for smooth blending
          orbColors[i % orbColors.length]
        ));
      }
    };

    const drawAuroraWaves = (t: number) => {
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      const waveColors = [
        'rgba(0, 255, 255, 0.05)',
        'rgba(128, 0, 255, 0.05)',
        'rgba(0, 255, 128, 0.05)'
      ];
      
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(0, height);
        
        for (let x = 0; x <= width; x += 100) {
          // Complex sine wave generation for organic aurora feel
          const y = height * 0.5 
                  + Math.sin(x * 0.003 + t * 0.0005 + i) * 150 
                  + Math.cos(x * 0.001 - t * 0.0003) * 100
                  + Math.sin(x * 0.002 + t * 0.0008 + i * 2) * 50;
          ctx.lineTo(x, y);
        }
        
        ctx.lineTo(width, height);
        ctx.fillStyle = waveColors[i];
        ctx.fill();
      }
      ctx.restore();
    };

    const animate = () => {
      time += 16;
      
      // Base dark background
      ctx.fillStyle = '#05050a';
      ctx.fillRect(0, 0, width, height);

      // Aurora Gradient Overlays
      drawAuroraWaves(time);

      // Metaballs
      ctx.globalCompositeOperation = 'screen';
      orbs.forEach(orb => {
        orb.update(time);
        orb.draw(ctx);
      });

      // Constellation
      ctx.globalCompositeOperation = 'source-over';
      ctx.lineWidth = 0.5;
      for (let i = 0; i < particles.length; i++) {
        particles[i].update();
        particles[i].draw(ctx);

        // Connect particles
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const distance = Math.sqrt(dx * dx + dy * dy);

          if (distance < 120) {
            ctx.beginPath();
            ctx.strokeStyle = `rgba(180, 220, 255, ${(1 - distance / 120) * 0.6})`;
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.stroke();
          }
        }
      }

      animationFrameId = requestAnimationFrame(animate);
    };

    const handleResize = () => init();
    const handleMouseMove = (e: MouseEvent) => {
      mouse.x = e.clientX;
      mouse.y = e.clientY;
    };
    const handleMouseLeave = () => {
      mouse.x = -1000;
      mouse.y = -1000;
    };

    init();
    
    if (!prefersReducedMotion) {
      animate();
    } else {
      // Static fallback for reduced motion
      ctx.fillStyle = '#05050a';
      ctx.fillRect(0, 0, width, height);
      drawAuroraWaves(0);
      orbs.forEach(o => o.draw(ctx));
      particles.forEach(p => p.draw(ctx));
    }

    window.addEventListener('resize', handleResize);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseleave', handleMouseLeave);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        pointerEvents: 'none',
        zIndex: -1,
      }}
      aria-hidden="true"
    />
  );
}
