import React, { useState, useEffect } from 'react';
import { Cpu, ShieldCheck, Zap, Sparkles, CheckCircle2, Layers } from 'lucide-react';
import { detectHardwareProfile, type HardwareProfile } from '../lib/hardwareDetection';

const PIPELINE_STEPS = [
  { id: 'extract', label: 'Scanning document layout & historical structure', weight: 0.25 },
  { id: 'neural', label: 'Synthesizing career trajectory & technical skills', weight: 0.35 },
  { id: 'ste100', label: 'Auditing action verbs & ATS compliance metrics', weight: 0.20 },
  { id: 'latex', label: 'Compiling high-density executive resume', weight: 0.20 },
];

export const LoadingSplashScreen: React.FC = () => {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [progress, setProgress] = useState(5);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [hardware, setHardware] = useState<HardwareProfile | null>(null);

  useEffect(() => {
    let isMounted = true;

    detectHardwareProfile().then((profile) => {
      if (isMounted) {
        setHardware(profile);
      }
    });

    const timeTimer = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);

    return () => {
      isMounted = false;
      clearInterval(timeTimer);
    };
  }, []);

  const totalEstimatedMs = hardware?.estimatedPipelineDurationMs || 4500;

  useEffect(() => {
    const updateIntervalMs = 50;
    const progressPerInterval = (updateIntervalMs / totalEstimatedMs) * 92;

    const progressTimer = setInterval(() => {
      setProgress((prev) => {
        const next = Math.min(prev + progressPerInterval, 95);
        if (next < 25) setCurrentStepIndex(0);
        else if (next < 60) setCurrentStepIndex(1);
        else if (next < 80) setCurrentStepIndex(2);
        else setCurrentStepIndex(3);
        return next;
      });
    }, updateIntervalMs);

    return () => clearInterval(progressTimer);
  }, [totalEstimatedMs]);

  const remainingSeconds = Math.max(
    1,
    Math.ceil(((100 - progress) / 100) * (totalEstimatedMs / 1000))
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative z-10 flex w-full max-w-lg flex-col rounded-2xl border border-border bg-card p-6 shadow-2xl animate-in zoom-in-95 duration-200">
        
        {/* Header with Brand Badge & Status */}
        <div className="flex items-center justify-between pb-4 border-b border-border/80">
          <div className="flex items-center gap-2.5">
            <div className="flex size-6 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-2xs">
              <Zap className="size-3.5" />
            </div>
            <span className="text-xs font-bold tracking-tight text-foreground">easyCV AI Pipeline</span>
          </div>

          <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-primary/10 text-primary border border-primary/20">
            <Sparkles className="size-3 text-primary animate-pulse" />
            <span>Neural Engine Active</span>
          </div>
        </div>

        {/* Central Animation & Status */}
        <div className="my-5 text-center flex flex-col items-center">
          <div className="relative mb-3 flex size-14 items-center justify-center rounded-2xl bg-primary/10 border border-primary/20 text-primary shadow-inner">
            <Cpu className="size-7 animate-pulse text-primary" />
            <Sparkles className="absolute -top-1 -right-1 size-4 text-primary animate-bounce" />
          </div>

          <p className="text-sm font-semibold text-foreground tracking-tight">
            {PIPELINE_STEPS[currentStepIndex].label}
          </p>
          <p className="text-xs font-mono text-muted-foreground mt-1">
            Optimizing ATS keywords & impact metrics...
          </p>
        </div>

        {/* Progress Bar */}
        <div className="space-y-2">
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted border border-border">
            <div 
              className="h-full bg-primary transition-all duration-150 ease-out rounded-full shadow-xs"
              style={{ width: `${progress}%` }}
            />
          </div>
          
          <div className="flex items-center justify-between text-xs font-mono text-muted-foreground">
            <span className="font-semibold text-foreground">{Math.round(progress)}% Complete</span>
            <span>~{remainingSeconds}s remaining</span>
          </div>
        </div>

        {/* Step-by-Step Checklist */}
        <div className="mt-5 space-y-1.5 rounded-xl border border-border bg-muted/30 p-3 text-xs">
          {PIPELINE_STEPS.map((step, idx) => {
            const isDone = idx < currentStepIndex;
            const isCurrent = idx === currentStepIndex;
            return (
              <div 
                key={step.id} 
                className={`flex items-center gap-2 transition-all ${
                  isCurrent ? 'text-foreground font-semibold' : isDone ? 'text-muted-foreground/70' : 'text-muted-foreground/40'
                }`}
              >
                {isDone ? (
                  <CheckCircle2 className="size-3.5 text-emerald-500 shrink-0" />
                ) : isCurrent ? (
                  <span className="size-2 rounded-full bg-primary animate-ping mx-0.5 shrink-0" />
                ) : (
                  <span className="size-2 rounded-full bg-muted-foreground/30 mx-0.5 shrink-0" />
                )}
                <span className="truncate">{step.label}</span>
              </div>
            );
          })}
        </div>

        {/* Telemetry Bar */}
        <div className="mt-4 flex items-center justify-between rounded-lg border border-border bg-background px-3 py-1.5 text-[11px] font-mono text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-foreground font-semibold">Autonomous Synthesis</span>
          </span>
          <span>{elapsedSeconds}s elapsed</span>
        </div>

      </div>
    </div>
  );
};
