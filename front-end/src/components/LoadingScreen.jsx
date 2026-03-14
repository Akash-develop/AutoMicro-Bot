import React from 'react';
import logo from '../assets/logo-recolored.png';

const LoadingScreen = () => {
  // Generate a few random particles
  const particles = Array.from({ length: 15 }).map((_, i) => ({
    id: i,
    left: `${Math.random() * 100}%`,
    top: `${Math.random() * 100 + 100}%`,
    duration: `${Math.random() * 5 + 5}s`,
    delay: `${Math.random() * 5}s`,
    size: `${Math.random() * 3 + 1}px`,
    drift: `${Math.random() * 40 - 20}px`
  }));

  return (
    <div className="loading-screen" data-tauri-drag-region>
      <div className="loading-particles" data-tauri-drag-region>
        {particles.map(p => (
          <div
            key={p.id}
            className="particle"
            style={{
              left: p.left,
              top: p.top,
              width: p.size,
              height: p.size,
              '--duration': p.duration,
              '--drift': p.drift,
              animationDelay: p.delay
            }}
          />
        ))}
      </div>
      
      <div className="loading-container-premium" data-tauri-drag-region>
        <div className="logo-outer-ring" data-tauri-drag-region />
        <div className="logo-inner-ring" data-tauri-drag-region />
        <img src={logo} alt="AutoMicro Logo" className="loading-logo" data-tauri-drag-region />
        
        <div className="loading-text" data-tauri-drag-region>
          Initializing
          <span className="dot">.</span>
          <span className="dot">.</span>
          <span className="dot">.</span>
        </div>
      </div>
    </div>
  );
};

export default LoadingScreen;
