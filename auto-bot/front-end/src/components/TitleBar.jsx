import { useState, useEffect, useRef } from 'react';
import logo from '../assets/automicro_bot_icon_v5.png';
import { isTauri } from '../utils/platform.js';

export default function TitleBar({ onClearChat, onToggleHistory, onMinimize, onOpenSettings, onNormalMode, onFloatingMode, onOpenTerminal, viewMode }) {
    const appWindowRef = useRef(null);
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const menuRef = useRef(null);

    useEffect(() => {
        let cancelled = false;
        const initWindow = async () => {
            if (!isTauri()) return;
            try {
                const { getCurrentWindow } = await import('@tauri-apps/api/window');
                if (!cancelled) appWindowRef.current = getCurrentWindow();
            } catch (err) {
                console.warn('Tauri window API unavailable; running in web mode.', err);
            }
        };
        initWindow();
        return () => {
            cancelled = true;
        };
    }, []);

    const handleClose = async () => {
        if (appWindowRef.current) await appWindowRef.current.close();
    };

    const handleMinimize = async () => {
        if (onMinimize) {
            onMinimize();
        } else {
            if (appWindowRef.current) await appWindowRef.current.minimize();
        }
    };

    const toggleMenu = (e) => {
        e.stopPropagation();
        setIsMenuOpen(!isMenuOpen);
    };

    const handleAction = (callback) => {
        setIsMenuOpen(false);
        if (callback) callback();
    };

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (menuRef.current && !menuRef.current.contains(event.target)) {
                setIsMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
        <div className="titlebar d-flex align-items-center justify-content-between position-relative" data-tauri-drag-region>
            <div className="d-flex align-items-center gap-3" data-tauri-drag-region>
                <div className="position-relative flex-shrink-0">
                    <div
                        className="rounded-circle d-flex align-items-center justify-content-center overflow-hidden"
                        style={{
                            width: '42px',
                            height: '42px',
                            background: 'var(--accent-subtle)',
                            border: '1px solid rgba(var(--accent-rgb), 0.2)',
                        }}
                    >
                        <img src={logo} alt="AutoMicro-bot Logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    </div>
                    <div
                        className="position-absolute pulse-glow"
                        style={{
                            bottom: '-1px',
                            right: '-1px',
                            width: '10px',
                            height: '10px',
                            borderRadius: '50%',
                            background: 'var(--accent)',
                            border: '2px solid var(--bg-main)',
                        }}
                    />
                </div>

                <div className="d-flex flex-column" data-tauri-drag-region>
                    <h1 className="m-0 d-flex align-items-center gap-1" style={{ fontSize: '15px', fontWeight: '700', letterSpacing: '-0.01em' }}>
                        <span className="text-gradient-primary">Auto</span>
                        <span style={{ color: 'var(--text-main)' }}>micro-Bot</span>
                    </h1>
                    <span className="font-mono" style={{ fontSize: '10px', color: 'var(--muted-foreground)' }}>
                        online • macOS agent
                    </span>
                </div>
            </div>

            <div className="d-flex align-items-center gap-1">
                <button
                    onClick={toggleMenu}
                    className="btn btn-link p-0 d-flex align-items-center justify-content-center"
                    style={{
                        width: '30px',
                        height: '30px',
                        background: isMenuOpen ? 'var(--accent-subtle)' : 'transparent',
                        borderRadius: '10px',
                        color: isMenuOpen ? 'var(--accent)' : 'var(--text-secondary)',
                        transition: 'all 0.2s ease',
                    }}
                >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                        <circle cx="12" cy="12" r="1" fill="currentColor" />
                        <circle cx="12" cy="5" r="1" fill="currentColor" />
                        <circle cx="12" cy="19" r="1" fill="currentColor" />
                    </svg>
                </button>

                <button
                    onClick={handleMinimize}
                    className="btn btn-link p-0 d-flex align-items-center justify-content-center"
                    style={{
                        width: '30px',
                        height: '30px',
                        borderRadius: '10px',
                        color: 'var(--text-secondary)',
                        transition: 'all 0.2s ease',
                    }}
                >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><line x1="5" y1="12" x2="19" y2="12" /></svg>
                </button>
                <button
                    onClick={handleClose}
                    className="btn btn-link p-0 d-flex align-items-center justify-content-center"
                    style={{
                        width: '30px',
                        height: '30px',
                        borderRadius: '10px',
                        color: 'var(--text-secondary)',
                        transition: 'all 0.2s ease',
                    }}
                >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                </button>
            </div>

            {isMenuOpen && (
                <div ref={menuRef} className="dropdown-menu-glass">
                    <button className="dropdown-item-custom" onClick={() => handleAction(onOpenTerminal)}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 17 10 11 4 5"></polyline><line x1="12" y1="19" x2="20" y2="19"></line></svg>
                        System Terminal
                    </button>
                    <button className="dropdown-item-custom" onClick={() => handleAction(viewMode === 'normal' ? onFloatingMode : onNormalMode)}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="9" y1="21" x2="9" y2="9"></line></svg>
                        {viewMode === 'normal' ? 'Floating Mode' : 'Normal Mode'}
                    </button>
                    <button className="dropdown-item-custom" onClick={() => handleAction(onOpenSettings)}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
                        Settings
                    </button>
                    <button className="dropdown-item-custom" onClick={() => handleAction(onToggleHistory)}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                        History
                    </button>
                    <div className="dropdown-divider-custom"></div>
                    <button className="dropdown-item-custom" onClick={() => handleAction(onClearChat)}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                        New Chat
                    </button>
                </div>
            )}
        </div>
    );
}
