import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useState } from 'react';
import ToolCallsList from './ToolCallsList.jsx';

export default function MessageBubble({ role, content, attachment, commands, timestamp, isNew }) {
    const isUser = role === 'user';
    const hasCommands = commands && commands.length > 0;
    const showBody = Boolean(content) || Boolean(attachment);

    const [copied, setCopied] = useState(false);

    const handleCopy = (e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(content);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    if (isUser) {
        return (
            <div className={`msg-row d-flex flex-column align-items-end ${isNew ? 'msg-animate' : ''} mb-4`}>
                {showBody && (
                    <div className="message-bubble bubble-user">
                        {attachment && attachment.mime_type && attachment.mime_type.startsWith('image/') && (
                            <div className="mb-2 overflow-hidden rounded" style={{ maxWidth: '300px', border: '1px solid var(--glass-border)', borderRadius: '12px' }}>
                                <img src={attachment.content} alt="attachment" className="w-100 h-auto d-block" style={{ maxHeight: '400px', objectFit: 'contain' }} />
                            </div>
                        )}
                        {content && (
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
                        )}
                    </div>
                )}
                {content && (
                    <div className="bot-actions-row">
                        <button
                            className={`bot-action-btn ${copied ? 'is-active' : ''}`}
                            onClick={handleCopy}
                            title="Copy"
                        >
                            {copied ? (
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                            ) : (
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                            )}
                        </button>
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className={`msg-row d-flex flex-column align-items-start ${isNew ? 'msg-animate' : ''} mb-4`}>
            {hasCommands && (
                <div className="assistant-tool-calls mb-2">
                    <ToolCallsList commands={commands} />
                </div>
            )}

            {showBody && (
                <div className="bot-message-content">
                    {attachment && attachment.mime_type && attachment.mime_type.startsWith('image/') && (
                        <div className="mb-2 overflow-hidden rounded" style={{ maxWidth: '300px', border: '1px solid var(--glass-border)', borderRadius: '12px' }}>
                            <img src={attachment.content} alt="attachment" className="w-100 h-auto d-block" style={{ maxHeight: '400px', objectFit: 'contain' }} />
                        </div>
                    )}
                    {content && (
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
                    )}
                </div>
            )}

            {content && (
                <div className="bot-actions-row">
                    <button
                        className={`bot-action-btn ${copied ? 'is-active' : ''}`}
                        onClick={handleCopy}
                        title="Copy"
                    >
                        {copied ? (
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                        ) : (
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                        )}
                    </button>
                    <button className="bot-action-btn" title="Good response">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z"></path><path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"></path></svg>
                    </button>
                    <button className="bot-action-btn" title="Bad response">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3H10z"></path><path d="M17 2h3a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-3"></path></svg>
                    </button>
                </div>
            )}
        </div>
    );
}
