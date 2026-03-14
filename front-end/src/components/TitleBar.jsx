/**
 * src/components/TitleBar.jsx
 * Custom drag region titlebar (replaces OS titlebar since decorations: false)
 */
import { useState, useEffect, useRef } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import logo from '../assets/logo-recolored.png';

export default function TitleBar({ onClearChat, onToggleHistory, onMinimize, onOpenSettings, onNormalMode, onFloatingMode, viewMode }) {
    const appWindow = getCurrentWindow();
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const menuRef = useRef(null);

    const handleClose = async () => {
        await appWindow.close();
    };

    const handleMinimize = async () => {
        if (onMinimize) {
            onMinimize();
        } else {
            await appWindow.minimize();
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

    // Close menu when clicking outside
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
                <div
                    className="rounded-circle d-flex align-items-center justify-content-center flex-shrink-0 shadow-sm overflow-hidden"
                    style={{ width: '48px', height: '48px', background: 'rgba(0,210,255,0.05)' }}
                >
                    <img src={logo} alt="AutoMicro-bot Logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>

                <div className="d-flex flex-column ms-2" data-tauri-drag-region>
                    <h1 className="m-0" style={{ fontSize: '18px', fontWeight: 'bold' }}>
                        <span style={{ color: '#00d2ff' }}>AutoMicro</span>
                        <span className="text-white">-Bot</span>
                    </h1>
                    <div className="d-flex align-items-center gap-2 mt-1" data-tauri-drag-region>
                        <span className="rounded-circle" style={{ width: '6px', height: '6px', background: '#10b981', boxShadow: '0 0 8px #10b981' }} />
                        <span style={{ color: '#10b981', fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Online</span>
                    </div>
                </div>
            </div>

            <div className="d-flex align-items-center gap-2">
                {/* Three-dots menu button */}
                <button
                    onClick={toggleMenu}
                    className={`btn btn-link p-0 d-flex align-items-center justify-content-center transition-all ${isMenuOpen ? 'text-white opacity-100' : 'text-white opacity-50 hover-opacity-100'}`}
                    style={{ width: '28px', height: '28px', background: isMenuOpen ? 'rgba(255,255,255,0.1)' : 'transparent', borderRadius: '50%' }}
                >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                        <circle cx="12" cy="12" r="1" fill="currentColor" />
                        <circle cx="12" cy="5" r="1" fill="currentColor" />
                        <circle cx="12" cy="19" r="1" fill="currentColor" />
                    </svg>
                </button>

                <button onClick={handleMinimize} className="btn btn-link p-0 text-white opacity-50 hover-opacity-100" style={{ width: '28px', height: '28px' }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><line x1="5" y1="12" x2="19" y2="12" /></svg>
                </button>
                <button onClick={handleClose} className="btn btn-link p-0 text-white opacity-50 hover-opacity-100" style={{ width: '28px', height: '28px' }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                </button>
            </div>

            {/* Dropdown Menu */}
            {isMenuOpen && (
                <div ref={menuRef} className="dropdown-menu-glass">
                    <button className="dropdown-item-custom" onClick={() => handleAction()}>
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


