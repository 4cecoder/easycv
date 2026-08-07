import React, { useState, useEffect } from 'react';

const MESSAGES = [
  'Initializing AI parsing engine...',
  'Parsing employment history...',
  'Calculating ASD-STE100 ATS match score...',
  'Formatting LaTeX structure...'
];

export const LoadingSplashScreen: React.FC = () => {
  const [messageIndex, setMessageIndex] = useState(0);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    // Estimate based on navigator.connection
    // @ts-ignore - NetworkInformation API might not be fully typed in standard lib
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    let baseTime = 10000;
    
    if (connection) {
      if (connection.effectiveType === '4g') {
        baseTime = 8000;
      } else if (connection.effectiveType === '3g') {
        baseTime = 15000;
      } else if (connection.effectiveType === '2g' || connection.effectiveType === 'slow-2g') {
        baseTime = 30000;
      }
    }
    
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

        <div className="h-2 w-full overflow-hidden rounded-full bg-black/20 shadow-inner">
          <div 
            className="h-full bg-blue-500 transition-all duration-75 ease-linear"
            style={{ width: `${progress}%` }}
          />
        </div>
        
        <div className="mt-2 text-sm font-semibold text-white/80">
          {Math.round(progress)}%
        </div>
      </div>
    </div>
  );
};
