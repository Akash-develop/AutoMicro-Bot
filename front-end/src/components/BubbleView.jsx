import { useRef, useState, useEffect } from 'react';
import logo from '../assets/logo-recolored.png';

/**
 * src/components/BubbleView.jsx
 * Small floating bubble representation of the app
 */
export default function BubbleView({ onRestore, isTyping, onStop }) {
    const clickCount = useRef(0);
    const clickTimer = useRef(null);
    const [showDone, setShowDone] = useState(false);

    // Monitor isTyping to show "Done" briefly after it becomes false
    useEffect(() => {
        if (!isTyping && !showDone) {
            // Check if we were just typing (you might want to track prevIsTyping if needed, 
            // but for simplicity we'll show it based on isTyping toggle)
            setShowDone(true);
            const timer = setTimeout(() => setShowDone(false), 3000);
            return () => clearTimeout(timer);
        }
    }, [isTyping]);

    const handleButtonClick = (e) => {
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
        }, 300); // 300ms window for clicks
    };

    return (
        <div className="bubble-ui-container" onClick={handleButtonClick} data-tauri-drag-region>
            {/* Morphing Island Bubble */}
            <div className={`bubble-circle shadow-sm ${(isTyping || showDone) ? 'is-expanded' : ''} ${showDone ? 'is-done' : ''}`} data-tauri-drag-region>
                <div className="bubble-logo-container">
                    <img src={logo} alt="AutoMicro Logo" className="bubble-logo-img" />
                </div>
                
                {(isTyping || showDone) && (
                    <div className="bubble-island-content animate-fade-in">
                        {isTyping ? (
                            <>
                                <div className="pill-dot pulse" />
                                <div className="status-text-anim">
                                    {"EXECUTING...".split("").map((char, i) => (
                                        <span key={i} style={{ '--i': i }}>{char}</span>
                                    ))}
                                </div>
                                <button 
                                    className="bubble-stop-btn ms-2"
                                    onClick={(e) => { e.stopPropagation(); onStop(); }}
                                    title="Stop"
                                >
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
                                        <rect x="6" y="6" width="12" height="12" rx="1" ry="1" />
                                    </svg>
                                </button>
                            </>
                        ) : (
                            <>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                <span className="status-text">DONE</span>
                            </>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
