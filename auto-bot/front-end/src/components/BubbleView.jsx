import { useRef, useState, useEffect } from 'react';
import logo from '../assets/automicro_bot_icon_v5.png';

export default function BubbleView({ onRestore, isTyping, onStop }) {
    const clickCount = useRef(0);
    const clickTimer = useRef(null);
    const [isLoading, setIsLoading] = useState(true);
    const [time, setTime] = useState(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    const [weather] = useState("28°C ☀️");

    useEffect(() => {
        // Initial loading sequence
        const timer = setTimeout(() => setIsLoading(false), 2000);
        
        const interval = setInterval(() => {
            setTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
        }, 60000);
        
        return () => {
            clearTimeout(timer);
            clearInterval(interval);
        };
    }, []);

    useEffect(() => {
        const onKeyDown = (e) => {
            if (isLoading) return;
            // Restore from bubble using Cmd + Option (macOS)
            // Trigger when the second modifier is pressed, while both are held.
            if (e.metaKey && e.altKey && (e.key === 'Alt' || e.key === 'Meta')) {
                e.preventDefault();
                onRestore('mini');
            }
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [isLoading, onRestore]);

    const handleButtonClick = (e) => {
        if (isLoading) return; // Prevent interaction during loading
        e.stopPropagation();
        clickCount.current += 1;

        if (clickTimer.current) {
            clearTimeout(clickTimer.current);
        }

        clickTimer.current = setTimeout(() => {
            if (clickCount.current === 2) {
                onRestore('mini');
            } else if (clickCount.current === 3) {
                onRestore('full');
            }
            clickCount.current = 0;
            clickTimer.current = null;
        }, 300);
    };

    return (
        <div className="bubble-ui-container" onClick={handleButtonClick} data-tauri-drag-region>
            <div className={`bubble-circle shadow-sm ${isTyping ? 'is-expanded' : ''} ${isLoading ? 'is-loading-pill' : ''}`} data-tauri-drag-region>
                
                {/* Always-on Bot Icon */}
                <div className="bubble-logo-container">
                    <img src={logo} alt="Bot Icon" className="bubble-logo-img" />
                </div>
                
                {/* Right-side Content (Fades in when !isLoading) */}
                <div className="bubble-island-content">
                    {isTyping ? (
                        <div className="d-flex align-items-center justify-content-between w-100">
                            <div className="d-flex align-items-center gap-1">
                                <div className="d-flex gap-1" style={{ marginRight: '2px' }}>
                                    <span className="typing-dot" style={{ backgroundColor: '#fff', opacity: 0.8, width: '3px', height: '3px' }} />
                                    <span className="typing-dot" style={{ backgroundColor: '#fff', opacity: 0.8, width: '3px', height: '3px' }} />
                                </div>
                                <span className="status-text-modern status-shimmer" style={{ textTransform: 'none', fontSize: '10px' }}>
                                    Running
                                </span>
                            </div>
                            <button 
                                className="bubble-stop-btn"
                                onClick={(e) => { e.stopPropagation(); onStop(); }}
                                title="Stop Agent"
                                style={{ width: '18px', height: '18px', margin: 0 }}
                            >
                                <svg width="6" height="6" viewBox="0 0 24 24" fill="currentColor">
                                    <rect x="6" y="6" width="12" height="12" rx="2" />
                                </svg>
                            </button>
                        </div>
                    ) : (
                        <div className="d-flex align-items-center justify-content-between w-100">
                            <div className="d-flex flex-column align-items-center justify-content-center gap-1" style={{ lineHeight: '1.1' }}>
                                <span style={{ fontSize: '12px' }}>☀️</span>
                                <span className="status-text-modern" style={{ fontSize: '9px', opacity: 0.8, marginTop: '-2px' }}>
                                    28°C
                                </span>
                            </div>
                            
                            <span className="status-text-modern" style={{ fontSize: '11px', letterSpacing: '0.02em', fontWeight: '700' }}>
                                {time}
                            </span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
