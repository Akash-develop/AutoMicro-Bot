import { useState, useRef, useEffect } from 'react';

export default function InputBar({ onSend, onStop, disabled }) {
    const [value, setValue] = useState('');
    const [selectedFile, setSelectedFile] = useState(null);
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [mode, setMode] = useState('chat'); // 'chat' | 'plan'
    const textareaRef = useRef(null);
    const fileInputRef = useRef(null);
    const menuRef = useRef(null);

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
        ta.style.height = Math.min(ta.scrollHeight, 80) + 'px';
    };

    const hasContent = value.trim() || selectedFile;

    return (
        <div className="input-bar-container">
            {/* Attachment Preview */}
            {selectedFile && (
                <div className="d-flex align-items-center gap-2 mb-2 animate-fade-in" style={{ width: 'fit-content' }}>
                    <div 
                        className="d-flex align-items-center gap-2 px-2 py-1 rounded-pill position-relative"
                        style={{ background: 'var(--input-bg)', border: '1px solid var(--glass-border)', backdropFilter: 'blur(12px)' }}
                    >
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
                        <span className="font-mono" style={{ fontSize: '11px', maxWidth: '120px', color: 'var(--text-main)', opacity: 0.9, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedFile.name}</span>
                        <button 
                            onClick={() => setSelectedFile(null)}
                            className="btn btn-link p-0 d-flex align-items-center justify-content-center"
                            style={{ width: '14px', height: '14px', border: 'none', color: 'var(--text-secondary)' }}
                        >
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                        </button>
                    </div>
                </div>
            )}

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

            {/* Unified Input Container (matches reference) */}
            <div 
                className="d-flex align-items-end gap-2 px-3 py-2 position-relative"
                style={{ 
                    background: 'var(--input-bg)', 
                    borderRadius: '20px', 
                    border: '1px solid var(--glass-border)',
                    transition: 'all 0.2s ease',
                }}
            >
                {/* Upload Menu — opens upward */}
                {isMenuOpen && (
                    <div 
                        ref={menuRef}
                        className="position-absolute dropdown-menu-glass show p-2" 
                        style={{ bottom: 'calc(100% + 8px)', left: '8px', width: '200px' }}
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
                {/* Paperclip / Attach */}
                <button 
                    onClick={() => setIsMenuOpen(!isMenuOpen)}
                    className="btn btn-link p-0 d-flex align-items-center justify-content-center flex-shrink-0" 
                    style={{
                        width: '28px',
                        height: '28px',
                        border: 'none',
                        color: isMenuOpen ? 'var(--accent)' : 'var(--text-secondary)',
                        transition: 'all 0.2s ease',
                        background: 'transparent',
                    }}
                    title="Attach file"
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path>
                    </svg>
                </button>

                {/* Textarea */}
                <textarea
                    ref={textareaRef}
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onInput={handleInput}
                    placeholder={mode === 'plan' ? 'Describe what you want to plan...' : 'Ask anything...'}
                    rows={1}
                    disabled={disabled}
                    className="flex-grow-1 bg-transparent border-0 outline-none"
                    style={{ fontSize: '13px', resize: 'none', minHeight: '24px', maxHeight: '80px', color: 'var(--text-main)', fontFamily: 'Inter, sans-serif', padding: '2px 0' }}
                />

                {/* Chat / Plan Mode Toggle */}
                <div 
                    className="d-flex align-items-center flex-shrink-0"
                    style={{ 
                        borderRadius: '8px', 
                        background: 'rgba(var(--accent-rgb), 0.08)', 
                        padding: '2px',
                    }}
                >
                    <button
                        onClick={() => setMode('chat')}
                        className="btn btn-link p-0 d-flex align-items-center justify-content-center"
                        style={{
                            width: '26px',
                            height: '26px',
                            borderRadius: '6px',
                            border: 'none',
                            background: mode === 'chat' ? 'var(--accent)' : 'transparent',
                            color: mode === 'chat' ? 'var(--bot-bubble-text)' : 'var(--text-secondary)',
                            transition: 'all 0.2s ease',
                            boxShadow: mode === 'chat' ? '0 2px 8px var(--accent-glow)' : 'none',
                        }}
                        title="Chat mode"
                    >
                        {/* MessageSquare icon */}
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                        </svg>
                    </button>
                    <button
                        onClick={() => setMode('plan')}
                        className="btn btn-link p-0 d-flex align-items-center justify-content-center"
                        style={{
                            width: '26px',
                            height: '26px',
                            borderRadius: '6px',
                            border: 'none',
                            background: mode === 'plan' ? 'var(--accent)' : 'transparent',
                            color: mode === 'plan' ? 'var(--bot-bubble-text)' : 'var(--text-secondary)',
                            transition: 'all 0.2s ease',
                            boxShadow: mode === 'plan' ? '0 2px 8px var(--accent-glow)' : 'none',
                        }}
                        title="Plan mode"
                    >
                        {/* ListChecks icon */}
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M10 6h11"></path><path d="M10 12h11"></path><path d="M10 18h11"></path>
                            <path d="M3 6l1 1 2-2"></path><path d="M3 12l1 1 2-2"></path><path d="M3 18l1 1 2-2"></path>
                        </svg>
                    </button>
                </div>

                {/* Send / Stop Button */}
                <button
                    onClick={disabled ? onStop : handleSend}
                    disabled={!disabled && !hasContent}
                    className="btn d-flex align-items-center justify-content-center p-0 flex-shrink-0"
                    style={{ 
                        width: '28px', 
                        height: '28px', 
                        borderRadius: '10px',
                        background: disabled ? 'rgba(239, 68, 68, 0.15)' : (hasContent ? 'var(--accent)' : 'transparent'),
                        color: disabled ? '#f87171' : (hasContent ? 'var(--bot-bubble-text)' : 'var(--text-secondary)'),
                        border: disabled ? '1px solid rgba(239, 68, 68, 0.25)' : 'none',
                        opacity: disabled || hasContent ? 1 : 0.3,
                        transition: 'all 0.2s ease',
                    }}
                    title={disabled ? "Stop generating" : "Send message"}
                >
                    {disabled ? (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="6" y="6" width="12" height="12" rx="1" ry="1" />
                        </svg>
                    ) : (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="22" y1="2" x2="11" y2="13" />
                            <polygon points="22 2 15 22 11 13 2 9 22 2" />
                        </svg>
                    )}
                </button>
            </div>
        </div>
    );
}
