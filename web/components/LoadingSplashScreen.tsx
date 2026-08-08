import React, { useState, useEffect } from 'react';

const MESSAGES = [
  '⚡ Initializing AI parsing engine...',
  '📄 Scanning uploaded resume history & documents...',
  '🎯 Extracting technical skills, tools & achievements...',
  '📊 Calculating ATS Technical Clarity score...',
  '🔗 Analyzing target job description & keyword alignment...',
  '✨ Generating high-impact engineering bullet points...',
  '📐 Compiling executive LaTeX PDF document structure...',
  '🚀 Finalizing your master career profile...'
];

export const LoadingSplashScreen: React.FC = () => {
  const [messageIndex, setMessageIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [estimatedMs, setEstimatedMs] = useState(10000);
  const [networkSpeed, setNetworkSpeed] = useState('4G');

  useEffect(() => {
    // Estimate based on navigator.connection
    // @ts-ignore - NetworkInformation API might not be fully typed in standard lib
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    let baseTime = 10000;
    
    if (connection) {
      const type = connection.effectiveType || '4g';
      setNetworkSpeed(type.toUpperCase());
      if (type === '4g') {
        baseTime = 8000;
      } else if (type === '3g') {
        baseTime = 15000;
      } else if (type === '2g' || type === 'slow-2g') {
        baseTime = 30000;
      }
    }
    setEstimatedMs(baseTime);

    const timeTimer = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);
    
    // Cycle messages every 2500ms
    const messageInterval = setInterval(() => {
      setMessageIndex((prev) => (prev + 1) % MESSAGES.length);
    }, 2500);

    // Progress simulation
    const updateInterval = 50; // ms
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
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-md" />
      
      <div className="relative z-10 flex w-full max-w-md flex-col items-center rounded-2xl border border-white/20 bg-white/10 p-8 shadow-2xl backdrop-blur-xl">
        <div className="mb-6 h-12 w-12 animate-spin rounded-full border-4 border-white/20 border-t-blue-500" />
        
        <div className="mb-8 h-6 text-center text-lg font-medium text-white drop-shadow-md transition-opacity duration-300">
          {MESSAGES[messageIndex]}
        </div>

        <div className="h-2.5 w-full overflow-hidden rounded-full bg-black/30 p-0.5 shadow-inner border border-white/10">
          <div 
            className="h-full bg-gradient-to-r from-blue-500 to-emerald-400 transition-all duration-75 ease-linear rounded-full"
            style={{ width: `${progress}%` }}
          />
        </div>
        
        <div className="mt-3 flex w-full items-center justify-between text-xs font-mono font-medium text-white/80">
          <span>{Math.round(progress)}% Complete</span>
          <span>~{Math.max(0, Math.ceil((100 - progress) * (estimatedMs / 1000) / 100))}s remaining</span>
        </div>

        {/* Developer Debug & Pipeline Status Bar */}
        <div className="mt-4 flex w-full items-center justify-between rounded-lg border border-white/10 bg-black/40 px-3 py-1.5 text-[11px] font-mono text-white/70 backdrop-blur-sm">
          <span className="flex items-center gap-1.5">
            <span className="inline-block size-2 rounded-full bg-emerald-400 animate-ping" />
            <span>Net: {networkSpeed}</span>
          </span>
          <span>Elapsed: {elapsedSeconds}s</span>
        </div>
      </div>
    </div>
  );
};
