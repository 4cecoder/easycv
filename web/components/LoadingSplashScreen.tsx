import React, { useState, useEffect } from 'react';
import { Cpu, ShieldCheck, Zap } from 'lucide-react';

const MESSAGES = [
  '⚡ Initializing local AI parsing engine...',
  '📄 Ingesting resume history & document metadata...',
  '🎯 Extracting technical competencies, tools & frameworks...',
  '📊 Evaluating ASD-STE100 Technical Clarity score...',
  '🔗 Aligning target job requisition & keyword density...',
  '✨ Generating high-impact engineering bullet points...',
  '📐 Compiling executive single-column LaTeX PDF structure...',
  '🚀 Finalizing your master career intelligence profile...'
];

export const LoadingSplashScreen: React.FC = () => {
  const [messageIndex, setMessageIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [estimatedMs, setEstimatedMs] = useState(8000);
  const [networkSpeed, setNetworkSpeed] = useState('4G');

  useEffect(() => {
    // Estimate based on navigator.connection
    // @ts-ignore - NetworkInformation API
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    let baseTime = 8000;
    
    if (connection) {
      const type = connection.effectiveType || '4g';
      setNetworkSpeed(type.toUpperCase());
      if (type === '4g') {
        baseTime = 6000;
      } else if (type === '3g') {
        baseTime = 12000;
      } else if (type === '2g' || type === 'slow-2g') {
        baseTime = 20000;
      }
    }
    setEstimatedMs(baseTime);

    const timeTimer = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);
    
    const messageInterval = setInterval(() => {
      setMessageIndex((prev) => (prev + 1) % MESSAGES.length);
    }, 2000);

    const updateInterval = 40; // ms
    const increment = (updateInterval / baseTime) * 100;
    
    const progressInterval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(progressInterval);
          return 100;
        }
        return Math.min(prev + increment, 100);
      });
    }, updateInterval);

    return () => {
      clearInterval(messageInterval);
      clearInterval(progressInterval);
      clearInterval(timeTimer);
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="relative z-10 flex w-full max-w-md flex-col items-center rounded-xl border border-border bg-card p-6 shadow-2xl animate-in zoom-in-95 duration-150">
        
        {/* Microsoft Fluent Progress Spinner */}
        <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Cpu className="size-6 animate-pulse text-primary" />
        </div>
        
        <div className="mb-6 h-10 text-center flex items-center justify-center px-2">
          <p className="text-sm font-semibold text-foreground tracking-tight transition-all duration-300">
            {MESSAGES[messageIndex]}
          </p>
        </div>

        {/* Fluent Progress Bar */}
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted border border-border">
          <div 
            className="h-full bg-primary transition-all duration-75 ease-linear rounded-full"
            style={{ width: `${progress}%` }}
          />
        </div>
        
        <div className="mt-2.5 flex w-full items-center justify-between text-xs font-mono font-medium text-muted-foreground">
          <span className="font-semibold text-foreground">{Math.round(progress)}% Complete</span>
          <span>~{Math.max(0, Math.ceil((100 - progress) * (estimatedMs / 1000) / 100))}s remaining</span>
        </div>

        {/* Engine Diagnostics Bar */}
        <div className="mt-5 flex w-full items-center justify-between rounded-md border border-border bg-muted/40 px-3 py-1.5 text-[11px] font-mono text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="inline-block size-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-foreground font-medium">Local Sandbox Engine</span>
          </span>
          <span>Runtime: {elapsedSeconds}s</span>
        </div>
      </div>
    </div>
  );
};

