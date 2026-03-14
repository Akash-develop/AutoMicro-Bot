/**
 * src/components/InputBar.jsx
 * Text input + send button
 */
import { useState, useRef, useEffect } from 'react';

export default function InputBar({ onSend, onStop, disabled }) {
    const [value, setValue] = useState('');
    const [selectedFile, setSelectedFile] = useState(null);
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const textareaRef = useRef(null);
    const fileInputRef = useRef(null);
    const menuRef = useRef(null);

    // Close menu when clicking outside
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (menuRef.current && !menuRef.current.contains(e.target)) {
                setIsMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleSend = () => {
        const trimmed = value.trim();
        if ((!trimmed && !selectedFile) || disabled) return;
        
        if (selectedFile) {
            const reader = new FileReader();
            reader.onload = (e) => {
                onSend(trimmed, {
                    name: selectedFile.name,
                    content: e.target.result,
                    mime_type: selectedFile.type,
                    size: selectedFile.size
                });
                setSelectedFile(null);
            };
            if (selectedFile.type.startsWith('image/')) {
                reader.readAsDataURL(selectedFile);
            } else {
                reader.readAsText(selectedFile);
            }
        } else {
            onSend(trimmed);
        }

        setValue('');
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
        }
    };

    const handleFileSelect = (e, type = 'any') => {
        const file = e.target.files[0];
        if (file) {
            if (type === 'image' && !file.type.startsWith('image/')) {
                alert('Please select an image file.');
                return;
            }
            setSelectedFile(file);
        }
        setIsMenuOpen(false);
        e.target.value = ''; 
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const handleInput = (e) => {
        const ta = e.target;
        ta.style.height = 'auto';
        ta.style.height = Math.min(ta.scrollHeight, 96) + 'px';
    };

    return (
        <div className="input-bar-container">
            {/* Attachment Preview (Chip or Image) */}
            {selectedFile && (
                <div className="d-flex align-items-center gap-2 mb-2 animate-fade-in" style={{ width: 'fit-content' }}>
                    <div className="d-flex align-items-center gap-2 px-2 py-1.5 rounded-pill bg-white/10 border border-white/5 backdrop-blur-md shadow-sm position-relative group">
                        {selectedFile.type.startsWith('image/') ? (
                            <div className="position-relative overflow-hidden rounded" style={{ width: '24px', height: '24px' }}>
                                <img 
                                    src={URL.createObjectURL(selectedFile)} 
                                    alt="preview" 
                                    className="w-100 h-100 object-fit-cover"
                                />
                            </div>
                        ) : (
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg>
                        )}
                        <span className="text-white opacity-90 truncate" style={{ fontSize: '11px', maxWidth: '120px' }}>{selectedFile.name}</span>
                        <button 
                            onClick={() => setSelectedFile(null)}
                            className="btn btn-link p-0 d-flex align-items-center justify-content-center text-white opacity-40 hover-opacity-100"
                            style={{ width: '14px', height: '14px', border: 'none' }}
                        >
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                        </button>
                    </div>
                </div>
            )}
            
            <div className="d-flex align-items-center gap-2 position-relative">
                {/* Hidden File Inputs */}
                <input 
                    type="file" 
                    ref={fileInputRef} 
                    style={{ display: 'none' }} 
                    onChange={(e) => handleFileSelect(e, 'any')}
                />
                <input 
                    type="file" 
                    id="imageInput"
                    accept="image/*"
                    style={{ display: 'none' }} 
                    onChange={(e) => handleFileSelect(e, 'image')}
                />

                {/* Upload Menu */}
                {isMenuOpen && (
                    <div 
                        ref={menuRef}
                        className="position-absolute dropdown-menu-glass show p-2" 
                        style={{ bottom: '50px', left: '0', top: 'auto', width: '200px' }}
                    >
                        <button className="dropdown-item-custom" onClick={() => document.getElementById('imageInput').click()}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
                            Upload Image
                        </button>
                        <button className="dropdown-item-custom" onClick={() => fileInputRef.current?.click()}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg>
                            Project Path (File)
                        </button>
                        <div className="dropdown-divider-custom"></div>
                        <button className="dropdown-item-custom" onClick={() => { alert('Clipboard read coming soon!'); setIsMenuOpen(false); }}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect></svg>
                            Read Clipboard
                        </button>
                    </div>
                )}

                {/* Left Action Button (Triggers Menu) */}
                <button 
                    onClick={() => setIsMenuOpen(!isMenuOpen)}
                    className="btn btn-link p-0 d-flex align-items-center justify-content-center flex-shrink-0" 
                    style={{ width: '38px', height: '38px', background: 'rgba(255,255,255,0.05)', borderRadius: '12px', border: 'none', color: 'rgba(255,255,255,0.4)' }}
                >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points={isMenuOpen ? "6 9 12 15 18 9" : "18 15 12 9 6 15"} />
                    </svg>
                </button>

                {/* Pill Input Container */}
                <div 
                    className="flex-grow-1 d-flex align-items-center px-3 shadow-lg"
                    style={{ 
                        background: 'rgba(25, 28, 30, 0.8)', 
                        borderRadius: '24px', 
                        backdropFilter: 'blur(12px)',
                        border: '1px solid rgba(255,255,255,0.08)'
                    }}
                >
                    <textarea
                        ref={textareaRef}
                        value={value}
                        onChange={(e) => setValue(e.target.value)}
                        onKeyDown={handleKeyDown}
                        onInput={handleInput}
                        placeholder="Tell AutoMicro what to do..."
                        rows={1}
                        disabled={disabled}
                        className="flex-grow-1 bg-transparent border-0 text-white outline-none py-2"
                        style={{ fontSize: '13px', resize: 'none', maxHeight: '120px' }}
                    />
                </div>

                {/* Send/Stop Button */}
                <button
                    onClick={disabled ? onStop : handleSend}
                    disabled={!disabled && !value.trim() && !selectedFile}
                    className="btn d-flex align-items-center justify-content-center p-0 flex-shrink-0 transition-all"
                    style={{ 
                        width: '38px', 
                        height: '38px', 
                        borderRadius: '12px',
                        background: disabled ? 'rgba(239, 68, 68, 0.2)' : ((value.trim() || selectedFile) ? 'var(--accent)' : 'rgba(255,255,255,0.05)'),
                        color: disabled ? '#f87171' : 'white',
                        border: disabled ? '1px solid rgba(239, 68, 68, 0.3)' : 'none',
                        boxShadow: !disabled && (value.trim() || selectedFile) ? '0 4px 15px var(--accent-glow)' : 'none',
                        opacity: disabled || (value.trim() || selectedFile) ? 1 : 0.5
                    }}
                    title={disabled ? "Stop generating" : "Send message"}
                >
                    {disabled ? (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="6" y="6" width="12" height="12" rx="1" ry="1" />
                        </svg>
                    ) : (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="22" y1="2" x2="11" y2="13" />
                            <polygon points="22 2 15 22 11 13 2 9 22 2" />
                        </svg>
                    )}
                </button>
            </div>
        </div>
    );
}

