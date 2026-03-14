import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useState, useEffect } from 'react';

function formatTime(timestamp) {
    if (!timestamp) return '';
    const d = new Date(timestamp);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function ToolIndicator({ commandObj }) {
    const [visible, setVisible] = useState(true);
    const [fadingOut, setFadingOut] = useState(false);

    const isExecuting = commandObj.result === null;
    const isStopped = commandObj.result === 'Stopped';

    useEffect(() => {
        if (!isExecuting) {
            const fadeTimer = setTimeout(() => {
                setFadingOut(true);
            }, 2000); 
            const removeTimer = setTimeout(() => {
                setVisible(false);
            }, 2300); 
            return () => {
                clearTimeout(fadeTimer);
                clearTimeout(removeTimer);
            };
        }
    }, [isExecuting]);

    if (!visible) return null;

    return (
        <div 
            className="d-flex align-items-center gap-2 mb-2 px-3 py-2 rounded-pill border border-secondary" 
            style={{ 
                fontSize: '11px', 
                background: 'rgba(30,30,40,0.7)',
                backdropFilter: 'blur(5px)',
                transition: 'opacity 0.3s ease, transform 0.3s ease',
                opacity: fadingOut ? 0 : 1,
                transform: fadingOut ? 'translateY(-5px)' : 'translateY(0)',
                width: 'max-content',
                borderColor: isStopped ? 'rgba(239, 68, 68, 0.3)' : (isExecuting ? 'rgba(255,255,255,0.1)' : 'rgba(34, 197, 94, 0.3)')
            }}
        >
            {isExecuting ? (
                <div className="tool-pulse ms-1 me-1" />
            ) : isStopped ? (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            ) : (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
            )}
            <span className="text-light opacity-75 fw-medium">
                {isExecuting ? 'Executing' : (isStopped ? 'Aborted' : 'Completed')}: <span className="text-info font-monospace">{commandObj.command}</span>
            </span>
        </div>
    );
}

export default function MessageBubble({ role, content, commands, timestamp, isNew }) {
    const isUser = role === 'user';
    const hasCommands = commands && commands.length > 0;
    
    // Do not show bubble-bot styling if there's no content yet but there ARE commands
    const showEmptyPillsOnly = !isUser && !content && hasCommands;

    const [copied, setCopied] = useState(false);

    const handleCopy = (e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(content);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className={`d-flex flex-column ${isUser ? 'align-items-end' : 'align-items-start'} ${isNew ? 'msg-animate' : ''} mb-4`}>
            {/* Header / Meta info */}
            <div className={`d-flex align-items-center gap-2 mb-1 px-1 opacity-50`}>
                {!isUser && (
                    <span style={{ fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase' }}>AutoMicro</span>
                )}
                {timestamp && <span style={{ fontSize: '9px' }}>{formatTime(timestamp)}</span>}
                {isUser && (
                    <span style={{ fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase' }}>You</span>
                )}
            </div>

            <div className={`position-relative ${showEmptyPillsOnly ? 'd-flex flex-column' : `message-bubble ${isUser ? 'bubble-user' : 'bubble-bot'}`}`}>
                {hasCommands && (
                    <div className="d-flex flex-column mb-1">
                        {commands.map((cmd, idx) => (
                            <ToolIndicator key={idx} commandObj={cmd} />
                        ))}
                    </div>
                )}
                {content && (
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {content}
                    </ReactMarkdown>
                )}
            </div>

            {/* Message Actions (ChatGPT Style) */}
            {content && !showEmptyPillsOnly && (
                <div className={`message-actions d-flex align-items-center gap-2 mt-1 px-2 ${isUser ? 'justify-content-end' : 'justify-content-start'}`}>
                    <button 
                        className={`action-btn ${copied ? 'copied' : ''}`}
                        onClick={handleCopy}
                        title="Copy message"
                    >
                        {copied ? (
                            <>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                <span className="ms-1" style={{ fontSize: '10px' }}>Copied!</span>
                            </>
                        ) : (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                        )}
                    </button>
                    {/* Placeholder for more actions like thumb up/down if needed later */}
                </div>
            )}
        </div>
    );
}



