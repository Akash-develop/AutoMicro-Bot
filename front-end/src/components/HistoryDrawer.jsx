/**
 * src/components/HistoryDrawer.jsx
 * ChatGPT-style conversation sidebar with date groups, rename, and delete.
 */
import { useEffect, useState, useRef } from 'react';
import { listSessions, renameConversation, deleteConversation } from '../api/chat';

// ─── Date Grouping ────────────────────────────────────────────────────────────

function getGroup(dateStr) {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now - d;
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays <= 7) return 'Previous 7 Days';
    if (diffDays <= 30) return 'Previous 30 Days';
    return 'Older';
}

const GROUP_ORDER = ['Today', 'Yesterday', 'Previous 7 Days', 'Previous 30 Days', 'Older'];

function groupSessions(sessions) {
    const groups = {};
    for (const s of sessions) {
        const g = getGroup(s.last_active || s.created_at);
        if (!groups[g]) groups[g] = [];
        groups[g].push(s);
    }
    return GROUP_ORDER.filter(g => groups[g]).map(g => ({ label: g, items: groups[g] }));
}

// ─── Single Conversation Row ──────────────────────────────────────────────────

function ConversationItem({ session, isActive, onSelect, onRenamed, onDeleted }) {
    const [hovering, setHovering] = useState(false);
    const [renaming, setRenaming] = useState(false);
    const [nameValue, setNameValue] = useState(session.title);
    const inputRef = useRef(null);

    useEffect(() => {
        if (renaming) inputRef.current?.focus();
    }, [renaming]);

    const commitRename = async () => {
        const trimmed = nameValue.trim();
        if (!trimmed || trimmed === session.title) {
            setNameValue(session.title);
            setRenaming(false);
            return;
        }
        try {
            await renameConversation(session.session_id, trimmed);
            onRenamed(session.session_id, trimmed);
        } catch {
            setNameValue(session.title);
        }
        setRenaming(false);
    };

    const handleDelete = async (e) => {
        e.stopPropagation();
        try {
            await deleteConversation(session.session_id);
            onDeleted(session.session_id);
        } catch (err) {
            console.error('Delete failed:', err);
        }
    };

    return (
        <div
            className={`convo-item ${isActive ? 'active' : ''}`}
            onMouseEnter={() => setHovering(true)}
            onMouseLeave={() => { setHovering(false); }}
            onClick={() => !renaming && onSelect(session.session_id)}
        >
            {renaming ? (
                <input
                    ref={inputRef}
                    className="convo-rename-input"
                    value={nameValue}
                    onChange={e => setNameValue(e.target.value)}
                    onBlur={commitRename}
                    onKeyDown={e => {
                        if (e.key === 'Enter') commitRename();
                        if (e.key === 'Escape') { setNameValue(session.title); setRenaming(false); }
                    }}
                    onClick={e => e.stopPropagation()}
                />
            ) : (
                <span className="convo-title">{session.title || session.last_message || 'New Chat'}</span>
            )}

            {hovering && !renaming && (
                <div className="convo-actions" onClick={e => e.stopPropagation()}>
                    {/* Rename */}
                    <button
                        className="convo-action-btn"
                        title="Rename"
                        onClick={e => { e.stopPropagation(); setRenaming(true); }}
                    >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                        </svg>
                    </button>
                    {/* Delete */}
                    <button
                        className="convo-action-btn convo-action-delete"
                        title="Delete"
                        onClick={handleDelete}
                    >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                            <path d="M10 11v6M14 11v6" />
                            <path d="M9 6V4h6v2" />
                        </svg>
                    </button>
                </div>
            )}
        </div>
    );
}

// ─── Main Drawer ──────────────────────────────────────────────────────────────

export default function HistoryDrawer({ isOpen, onClose, onSelectSession, onNewChat, currentSessionId, isPersistent }) {
    const [sessions, setSessions] = useState([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (isOpen) fetchSessions();
    }, [isOpen]);

    const fetchSessions = async () => {
        setLoading(true);
        try {
            const data = await listSessions();
            setSessions(data);
        } catch (err) {
            console.error('Failed to fetch sessions:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleRenamed = (sessionId, newTitle) => {
        setSessions(prev =>
            prev.map(s => s.session_id === sessionId ? { ...s, title: newTitle } : s)
        );
    };

    const handleDeleted = (sessionId) => {
        setSessions(prev => prev.filter(s => s.session_id !== sessionId));
        // If we deleted the active conversation, start a new chat
        if (sessionId === currentSessionId) {
            onNewChat();
        }
    };

    const handleNewChat = () => {
        onNewChat();
        if (!isPersistent) onClose();
    };

    const handleSelect = (id) => {
        onSelectSession(id);
        if (!isPersistent) onClose();
    };

    // If it's persistent (sidebar), we don't return null when !isOpen, we just don't show the overlay
    if (!isOpen && !isPersistent) return null;

    const grouped = groupSessions(sessions);

    return (
        <div 
            className={`history-drawer-overlay ${isPersistent ? 'is-persistent' : ''} ${isOpen ? 'is-open' : ''}`} 
            onClick={isPersistent ? undefined : onClose}
        >
            <div 
                className={`history-drawer-content ${isPersistent ? 'is-persistent' : ''}`} 
                onClick={e => e.stopPropagation()}
            >

                {/* Header */}
                <div className="drawer-header">
                    <div className="d-flex align-items-center gap-2">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                        </svg>
                        <h5 className="m-0 text-white" style={{ fontSize: '14px', fontWeight: '600' }}>Conversations</h5>
                    </div>
                    <button className="drawer-close-btn" onClick={onClose}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                    </button>
                </div>

                {/* New Chat Button */}
                <button className="new-chat-btn" onClick={handleNewChat}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                        <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                    New Chat
                </button>

                {/* Conversation List */}
                <div className="drawer-body">
                    {loading ? (
                        <div className="d-flex justify-content-center p-4">
                            <div className="spinner-border spinner-border-sm" style={{ color: 'rgba(99,102,241,0.7)' }} role="status" />
                        </div>
                    ) : sessions.length === 0 ? (
                        <div className="convo-empty">
                            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                            </svg>
                            <span>No conversations yet</span>
                            <span style={{ fontSize: '11px', opacity: 0.4 }}>Start chatting to create one</span>
                        </div>
                    ) : (
                        grouped.map(group => (
                            <div key={group.label} className="convo-group">
                                <div className="convo-group-label">{group.label}</div>
                                {group.items.map(s => (
                                    <ConversationItem
                                        key={s.session_id}
                                        session={s}
                                        isActive={s.session_id === currentSessionId}
                                        onSelect={handleSelect}
                                        onRenamed={handleRenamed}
                                        onDeleted={handleDeleted}
                                    />
                                ))}
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}
