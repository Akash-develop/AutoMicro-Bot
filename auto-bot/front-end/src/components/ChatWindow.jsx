import { useEffect, useRef } from 'react';
import MessageBubble from './MessageBubble.jsx';
import logo from '../assets/automicro_bot_icon_v5.png';

const SUGGESTIONS = [
    { label: 'Summarize screen', emoji: '📋' },
    { label: 'Open app', emoji: '🚀' },
    { label: 'Quick note', emoji: '📝' },
    { label: 'Run macro', emoji: '⚡' },
    { label: 'Organize files', emoji: '📁' },
    { label: 'System info', emoji: '💻' },
];

function TypingIndicator() {
    return (
        <div className="d-flex align-items-start mb-4">
            <div className="typing-indicator-bar">
                <span className="typing-dot" />
                <span className="typing-dot" />
                <span className="typing-dot" />
            </div>
        </div>
    );
}

function WelcomeMini() {
    return (
        <div className="d-flex flex-column align-items-center justify-content-center flex-grow-1 pb-5">
            <div
                className="d-flex align-items-center justify-content-center mb-4 overflow-hidden glow-primary"
                style={{
                    width: '80px',
                    height: '80px',
                    borderRadius: '24px',
                    background: 'var(--accent-subtle)',
                    border: '1px solid rgba(var(--accent-rgb), 0.2)',
                }}
            >
                <img
                    src={logo}
                    alt="AutoMicro-bot Logo"
                    style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '24px' }}
                />
            </div>
            <h2 className="m-0" style={{ fontSize: '22px', fontWeight: '700', letterSpacing: '-0.02em' }}>
                <span className="text-gradient-primary">Auto</span>
                <span style={{ color: 'var(--text-main)' }}> micro-Bot</span>
            </h2>
            <p className="text-center mt-2 mb-0" style={{ fontSize: '13px', lineHeight: '1.6', color: 'var(--muted-foreground)', maxWidth: '260px' }}>
                Your AI desktop agent for macOS. I can automate tasks, control apps, and more.
            </p>

            <div className="d-flex gap-2 mt-4 flex-wrap justify-content-center">
                {['Summarize screen', 'Open app', 'Quick note'].map((label) => (
                    <span
                        key={label}
                        className="font-mono"
                        style={{
                            fontSize: '11px',
                            padding: '6px 14px',
                            borderRadius: '20px',
                            border: '1px solid var(--glass-border)',
                            color: 'var(--muted-foreground)',
                            cursor: 'default',
                        }}
                    >
                        {label}
                    </span>
                ))}
            </div>

            <span className="font-mono mt-4" style={{ fontSize: '10px', color: 'var(--muted-foreground)', opacity: 0.5 }}>
                v1.0.0 • macOS agent • Built with Tauri
            </span>
        </div>
    );
}

function WelcomeNormal({ onSuggestionClick }) {
    return (
        <div className="normal-welcome">
            <div className="normal-welcome-icon glow-primary">
                <img
                    src={logo}
                    alt="AutoMicro-bot"
                    style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '24px' }}
                />
            </div>
            <div>
                <h2 className="m-0" style={{ fontSize: '22px', fontWeight: '600', color: 'var(--text-main)' }}>
                    Hey, I'm <span className="text-gradient-primary">Auto micro-Bot</span>
                </h2>
                <p className="mt-2 mb-0" style={{ fontSize: '14px', color: 'var(--muted-foreground)', maxWidth: '360px', lineHeight: '1.6' }}>
                    Your AI desktop agent for macOS. I can automate tasks, control apps, take notes, and more.
                </p>
            </div>

            <div className="suggestion-grid">
                {SUGGESTIONS.map((s) => (
                    <button
                        key={s.label}
                        className="suggestion-card"
                        onClick={() => onSuggestionClick && onSuggestionClick(s.label)}
                    >
                        <span className="suggestion-card-emoji">{s.emoji}</span>
                        <span>{s.label}</span>
                    </button>
                ))}
            </div>

            <span className="font-mono mt-3" style={{ fontSize: '11px', color: 'var(--muted-foreground)', opacity: 0.5 }}>
                Press ⌘K to toggle floating mode
            </span>
        </div>
    );
}


export default function ChatWindow({ messages, isTyping, newMsgId, isNormalMode, onSuggestionClick }) {
    const bottomRef = useRef(null);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, isTyping]);

    return (
        <div className="chat-history">
            {messages.length === 0 ? (
                isNormalMode ? <WelcomeNormal onSuggestionClick={onSuggestionClick} /> : <WelcomeMini />
            ) : (
                messages.map((msg) => {
                    if (msg.role === 'assistant' && !msg.content && (!msg.commands || msg.commands.length === 0) && msg.id === newMsgId && isTyping) {
                        return null;
                    }
                    return (
                        <MessageBubble
                            key={msg.id}
                            role={msg.role}
                            content={msg.content}
                            attachment={msg.attachment}
                            commands={msg.commands}
                            timestamp={msg.timestamp}
                            isNew={msg.id === newMsgId}
                        />
                    );
                })
            )}

            {isTyping && <TypingIndicator />}
            <div ref={bottomRef} />
        </div>
    );
}
