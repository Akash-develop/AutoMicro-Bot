/**
 * src/components/ChatWindow.jsx
 * Scrollable message history + typing indicator
 */
import { useEffect, useRef } from 'react';
import MessageBubble from './MessageBubble.jsx';
import logo from '../assets/logo-recolored.png';

function TypingIndicator() {
    return (
        <div className="luminous-container mb-4" style={{ width: 'fit-content' }}>
            <div className="glow-orb" />
            <div className="glow-orb" />
            <div className="glow-orb" />
            <span className="text-white opacity-40 ms-2" style={{ fontSize: '11px', fontWeight: '500', letterSpacing: '0.02em' }}>Thinking</span>
        </div>
    );
}

function WelcomeMessage() {
    return (
        <div className="d-flex flex-column align-items-center justify-content-center flex-grow-1 pb-5">
            <div
                className="rounded-circle d-flex align-items-center justify-content-center mb-4 shadow-lg overflow-hidden"
                style={{ width: '120px', height: '120px', background: 'rgba(0, 210, 255, 0.1)', border: '1px solid rgba(0, 210, 255, 0.2)' }}
            >
                <div
                    className="rounded-circle d-flex align-items-center justify-content-center overflow-hidden"
                    style={{ width: '100%', height: '100%', background: 'rgba(0, 210, 255, 0.15)' }}
                >
                    <img src={logo} alt="AutoMicro-bot Logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
            </div>
            <h2 className="m-0" style={{ fontSize: '28px', fontWeight: 'bold', letterSpacing: '-0.02em' }}>
                <span style={{ color: '#00d2ff' }}>AutoMicro</span><span className="text-white">-Bot</span>
            </h2>
            <div className="text-white text-center mt-2 opacity-50" style={{ fontSize: '15px', lineHeight: '1.6' }}>
                Your local AI assistant is ready.<br />
                How can I help you today?
            </div>
        </div>
    );
}


export default function ChatWindow({ messages, isTyping, newMsgId }) {
    const bottomRef = useRef(null);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, isTyping]);

    return (
        <div className="chat-history">
            {messages.length === 0 ? (
                <WelcomeMessage />
            ) : (
                messages.map((msg) => {
                    // Hide empty assistant messages while typing
                    if (msg.role === 'assistant' && !msg.content && (!msg.commands || msg.commands.length === 0) && msg.id === newMsgId && isTyping) {
                        return null;
                    }
                    return (
                        <MessageBubble
                            key={msg.id}
                            role={msg.role}
                            content={msg.content}
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

