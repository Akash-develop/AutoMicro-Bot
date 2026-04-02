import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useState } from 'react';
import ToolCallsList from './ToolCallsList.jsx';

function formatTime(timestamp) {
    if (!timestamp) return '';
    const d = new Date(timestamp);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function MessageBubble({ role, content, attachment, commands, timestamp, isNew }) {
    const isUser = role === 'user';
    const hasCommands = commands && commands.length > 0;
    // Assistant: tool / terminal blocks sit above the glass bubble; bubble holds attachment + text only
    const showBubbleBody = isUser || Boolean(content) || Boolean(attachment);

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

            {!isUser && (hasCommands || showBubbleBody) && (
                <div className="assistant-message-stack">
                    {hasCommands && (
                        <div className="tool-calls-above-bubble mb-2">
                            <ToolCallsList commands={commands} />
                        </div>
                    )}
                    {showBubbleBody && (
                        <div className="position-relative message-bubble bubble-bot">
                            {attachment && attachment.mime_type && attachment.mime_type.startsWith('image/') && (
                                <div className="mb-2 overflow-hidden rounded-lg border" style={{ maxWidth: '300px', borderColor: 'var(--glass-border)' }}>
                                    <img 
                                        src={attachment.content} 
                                        alt="attachment" 
                                        className="w-100 h-auto d-block"
                                        style={{ maxHeight: '400px', objectFit: 'contain' }}
                                    />
                                </div>
                            )}
                            {content && (
                                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                    {content}
                                </ReactMarkdown>
                            )}
                        </div>
                    )}
                </div>
            )}
            {isUser && hasCommands && (
                <div className={`message-bubble bubble-user position-relative mb-2`}>
                    <ToolCallsList commands={commands} />
                </div>
            )}
            {isUser && showBubbleBody && (
                <div className="position-relative message-bubble bubble-user">
                    {attachment && attachment.mime_type && attachment.mime_type.startsWith('image/') && (
                        <div className="mb-2 overflow-hidden rounded-lg border" style={{ maxWidth: '300px', borderColor: 'var(--glass-border)' }}>
                            <img 
                                src={attachment.content} 
                                alt="attachment" 
                                className="w-100 h-auto d-block"
                                style={{ maxHeight: '400px', objectFit: 'contain' }}
                            />
                        </div>
                    )}
                    {content && (
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {content}
                        </ReactMarkdown>
                    )}
                </div>
            )}

            {/* Message Actions (ChatGPT Style) */}
            {content && (
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



