/**
 * src/components/SettingsDrawer.jsx
 * Right-to-left drawer for managing agent tool permissions and memories.
 */
import { useState, useEffect } from 'react';
import { getPermissions, updatePermissions, deletePermission, getMemories, deleteMemory, clearMemories } from '../api/settings.js';

export default function SettingsDrawer({ isOpen, onClose }) {
    const [activeMenu, setActiveMenu] = useState('main'); // 'main', 'permissions', 'memory'
    const [permissions, setPermissions] = useState({});
    const [lockedTools, setLockedTools] = useState([]);
    const [memories, setMemories] = useState([]);
    const [loading, setLoading] = useState(true);
    const [editingTool, setEditingTool] = useState(null);
    const [editValue, setEditValue] = useState("");
    const [isGlobalLocked, setIsGlobalLocked] = useState(
        localStorage.getItem('toolSettingsLocked') === 'true'
    );

    // Reset view when opening
    useEffect(() => {
        if (isOpen) {
            setActiveMenu('main');
        }
    }, [isOpen]);

    const toggleGlobalLock = () => {
        const newLockState = !isGlobalLocked;
        setIsGlobalLocked(newLockState);
        localStorage.setItem('toolSettingsLocked', newLockState);
        if (newLockState) setEditingTool(null);
    };

    const BUILTIN_TOOLS = [
        "execute_terminal_command",
        "open_url",
        "search_web",
        "sleep_system",
        "create_folder",
        "create_file",
        "create_excel_with_sample_data"
    ];

    useEffect(() => {
        if (isOpen && activeMenu === 'permissions') {
            setLoading(true);
            getPermissions()
                .then(data => {
                    const lTools = data._locked_tools || [];
                    const perms = { ...data };
                    delete perms._locked_tools;
                    setPermissions(perms);
                    setLockedTools(lTools);
                })
                .catch(err => console.error("Failed to fetch permissions", err))
                .finally(() => setLoading(false));
        }
    }, [isOpen, activeMenu]);

    useEffect(() => {
        if (isOpen && activeMenu === 'memory') {
            setLoading(true);
            getMemories()
                .then(data => {
                    setMemories(data.memories || []);
                })
                .catch(err => console.error("Failed to fetch memories", err))
                .finally(() => setLoading(false));
        }
    }, [isOpen, activeMenu]);

    const handleDeleteMemory = async (id) => {
        try {
            await deleteMemory(id);
            setMemories(prev => prev.filter(m => m.id !== id));
        } catch (err) {
            console.error("Failed to delete memory", err);
        }
    };

    const handleClearMemories = async () => {
        if (!window.confirm("Are you sure you want to clear all long-term memories?")) return;
        try {
            await clearMemories();
            setMemories([]);
        } catch (err) {
            console.error("Failed to clear memories", err);
        }
    };

    const handleToggle = async (toolName) => {
        const updated = {
            ...permissions,
            [toolName]: !permissions[toolName]
        };
        setPermissions(updated);
        try {
            await updatePermissions(updated, lockedTools);
        } catch (err) {
            console.error("Failed to commit permission change", err);
            setPermissions(permissions);
        }
    };

    const handleIndividualLock = async (toolName) => {
        const isCurrentlyLocked = lockedTools.includes(toolName);
        const updatedLocks = isCurrentlyLocked
            ? lockedTools.filter(t => t !== toolName)
            : [...lockedTools, toolName];

        setLockedTools(updatedLocks);
        if (editingTool === toolName) setEditingTool(null);

        try {
            await updatePermissions(permissions, updatedLocks);
        } catch (err) {
            console.error("Failed to lock tool", err);
            setLockedTools(lockedTools);
        }
    };

    const handleDelete = async (toolName) => {
        const updated = { ...permissions };
        delete updated[toolName];

        // Remove from locks if present
        const updatedLocks = lockedTools.filter(t => t !== toolName);

        setPermissions(updated);
        setLockedTools(updatedLocks);

        try {
            await deletePermission(toolName);
            if (updatedLocks.length !== lockedTools.length) {
                await updatePermissions(updated, updatedLocks);
            }
        } catch (err) {
            console.error("Failed to delete permission", err);
            setPermissions(permissions);
        }
    };

    const handleAdd = async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const newTool = fd.get('newToolName').trim().replace(/\s+/g, '_').toLowerCase();
        if (!newTool || permissions[newTool] !== undefined) return;

        const updated = {
            ...permissions,
            [newTool]: true
        };
        setPermissions(updated);
        e.target.reset();
        try {
            await updatePermissions(updated, lockedTools);
        } catch (err) {
            console.error("Failed to add permission", err);
            setPermissions(permissions);
        }
    };

    const startEdit = (toolName) => {
        setEditingTool(toolName);
        setEditValue(toolName);
    };

    const handleSaveEdit = async (oldName) => {
        const newName = editValue.trim().replace(/\s+/g, '_').toLowerCase();

        if (!newName || newName === oldName) {
            setEditingTool(null);
            return;
        }

        if (permissions[newName] !== undefined) {
            alert("A tool with this name already exists.");
            return;
        }

        const updated = { ...permissions };
        const val = updated[oldName];
        delete updated[oldName];
        updated[newName] = val;

        let newLocks = lockedTools;
        if (lockedTools.includes(oldName)) {
            newLocks = newLocks.filter(t => t !== oldName);
            newLocks.push(newName);
        }

        setPermissions(updated);
        setLockedTools(newLocks);
        setEditingTool(null);

        try {
            await updatePermissions(updated, newLocks);
        } catch (err) {
            console.error("Failed to edit permission", err);
            setPermissions(permissions);
        }
    };

    const formatToolName = (name) => {
        return name.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
    };

    // Sub-renderers for cleaner code structure
    const renderSidebarHeader = (title, showBack = false) => (
        <div className="p-3 border-bottom border-secondary d-flex justify-content-between align-items-center">
            <div className="d-flex align-items-center gap-2">
                {showBack && (
                    <button
                        onClick={() => setActiveMenu('main')}
                        className="btn btn-link p-0 text-secondary hover-text-white d-flex align-items-center me-1"
                        title="Back to Settings"
                    >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
                    </button>
                )}
                <h6 className="m-0 text-white fw-bold d-flex align-items-center gap-2">
                    {title}
                    {title === 'Tool Permissions' && (
                        <button
                            onClick={toggleGlobalLock}
                            className="btn btn-link p-0 text-secondary hover-text-white d-flex align-items-center"
                            title={isGlobalLocked ? "Global View Locked" : "Global View Unlocked"}
                        >
                            {isGlobalLocked ? (
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                            ) : (
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 9.9-1"></path></svg>
                            )}
                        </button>
                    )}
                </h6>
            </div>
            <button onClick={onClose} className="btn-close btn-close-white" style={{ fontSize: '0.8rem' }} />
        </div>
    );

    return (
        <>
            <div
                className={`drawer-backdrop ${isOpen ? 'show' : ''}`}
                onClick={onClose}
                style={{
                    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.5)', zIndex: 1040,
                    opacity: isOpen ? 1 : 0, pointerEvents: isOpen ? 'auto' : 'none',
                    transition: 'opacity 0.3s ease'
                }}
            />

            <div
                className="history-drawer"
                style={{
                    position: 'absolute', top: 0, right: 0, width: '280px', height: '100%',
                    background: 'rgba(30,30,40,0.95)', backdropFilter: 'blur(10px)',
                    borderLeft: '1px solid rgba(255,255,255,0.1)',
                    zIndex: 1050, transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
                    transition: 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
                    display: 'flex', flexDirection: 'column'
                }}
            >
                {activeMenu === 'main' ? (
                    <>
                        {renderSidebarHeader('Settings')}
                        <div className="flex-grow-1 overflow-auto p-2">
                            <button
                                onClick={() => setActiveMenu('permissions')}
                                className="w-100 text-start btn btn-dark bg-transparent border-0 d-flex justify-content-between align-items-center py-3 px-3 hover-bg-secondary"
                                style={{ transition: 'background-color 0.2s', borderRadius: '8px' }}
                            >
                                <span className="text-light fw-medium">Tool Permissions</span>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-secondary"><polyline points="9 18 15 12 9 6"></polyline></svg>
                            </button>

                            <button
                                onClick={() => setActiveMenu('memory')}
                                className="w-100 text-start btn btn-dark bg-transparent border-0 d-flex justify-content-between align-items-center py-3 px-3 mt-2 hover-bg-secondary"
                                style={{ transition: 'background-color 0.2s', borderRadius: '8px' }}
                            >
                                <span className="text-light fw-medium">LTM Storage</span>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-secondary"><polyline points="9 18 15 12 9 6"></polyline></svg>
                            </button>

                            <div className="mt-4 px-3 text-secondary" style={{ fontSize: '0.8rem' }}>
                                Build version: 1.0.1
                            </div>
                        </div>
                    </>
                ) : activeMenu === 'permissions' ? (
                    <>
                        {renderSidebarHeader('Tool Permissions', true)}

                        <div className="flex-grow-1 overflow-auto p-3">
                            {loading ? (
                                <div className="text-secondary text-center mt-4">Loading...</div>
                            ) : (
                                <>
                                    <form onSubmit={handleAdd} className="mb-4 d-flex gap-2">
                                        <input
                                            type="text"
                                            name="newToolName"
                                            className="form-control form-control-sm bg-dark text-white border-secondary"
                                            placeholder="Add custom rule..."
                                            disabled={isGlobalLocked}
                                        />
                                        <button type="submit" className="btn btn-sm btn-outline-success" disabled={isGlobalLocked}>+</button>
                                    </form>

                                    {Object.keys(permissions)
                                        .filter(tool => !BUILTIN_TOOLS.includes(tool))
                                        .map((tool) => {
                                            const isIndividuallyLocked = lockedTools.includes(tool);
                                            const effectiveLocked = isGlobalLocked || isIndividuallyLocked;
                                            const isEnabled = permissions[tool] || false;

                                            return (
                                                <div key={tool} className="d-flex justify-content-between align-items-center mb-3">
                                                    {editingTool === tool && !effectiveLocked ? (
                                                        <div className="d-flex gap-2 w-100 me-2">
                                                            <input
                                                                autoFocus
                                                                type="text"
                                                                className="form-control form-control-sm bg-dark text-white border-primary"
                                                                value={editValue}
                                                                onChange={e => setEditValue(e.target.value)}
                                                                onKeyDown={e => { if (e.key === 'Enter') handleSaveEdit(tool); if (e.key === 'Escape') setEditingTool(null); }}
                                                            />
                                                            <button onClick={() => handleSaveEdit(tool)} className="btn btn-sm btn-success py-0 px-2">✓</button>
                                                        </div>
                                                    ) : (
                                                        <>
                                                            <div className="d-flex align-items-center gap-2">
                                                                <span
                                                                    className={`text-light small text-break ${!effectiveLocked ? 'cursor-pointer' : ''}`}
                                                                    style={{
                                                                        fontSize: '13px',
                                                                        maxWidth: '140px',
                                                                        cursor: !effectiveLocked ? 'pointer' : 'default',
                                                                        opacity: effectiveLocked ? 0.7 : 1
                                                                    }}
                                                                    onClick={() => { if (!effectiveLocked) startEdit(tool); }}
                                                                    title={effectiveLocked ? "Unlock to edit" : "Click to edit rule"}
                                                                >
                                                                    {formatToolName(tool)}
                                                                </span>

                                                                <button
                                                                    onClick={() => handleIndividualLock(tool)}
                                                                    className="btn btn-link p-0 ms-2 text-secondary hover-text-white d-flex align-items-center"
                                                                    title={isIndividuallyLocked ? "Unlock rule" : "Lock rule"}
                                                                    style={{ opacity: isGlobalLocked ? 0.3 : 1, pointerEvents: isGlobalLocked ? 'none' : 'auto' }}
                                                                >
                                                                    {isIndividuallyLocked ? (
                                                                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                                                                    ) : (
                                                                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 9.9-1"></path></svg>
                                                                    )}
                                                                </button>
                                                            </div>

                                                            <div className="d-flex align-items-center gap-2">
                                                                <div className="form-check form-switch m-0" title={isEnabled ? "Rule Active" : "Rule Inactive"}>
                                                                    <input
                                                                        className="form-check-input"
                                                                        type="checkbox"
                                                                        role="switch"
                                                                        id={`switch-${tool}`}
                                                                        checked={isEnabled}
                                                                        onChange={() => !effectiveLocked && handleToggle(tool)}
                                                                        style={{ cursor: effectiveLocked ? 'not-allowed' : 'pointer' }}
                                                                        disabled={effectiveLocked}
                                                                    />
                                                                </div>
                                                                <button
                                                                    onClick={() => !effectiveLocked && handleDelete(tool)}
                                                                    className={`btn btn-link p-0 text-danger hover-opacity-100 ${effectiveLocked ? 'opacity-25' : 'opacity-75'}`}
                                                                    title={effectiveLocked ? "Unlock to delete" : "Delete rule"}
                                                                    disabled={effectiveLocked}
                                                                    style={{ cursor: effectiveLocked ? 'not-allowed' : 'pointer' }}
                                                                >
                                                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6V20a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                                                                </button>
                                                            </div>
                                                        </>
                                                    )}
                                                </div>
                                            );
                                        })}
                                </>
                            )}
                        </div>
                    </>
                ) : (
                    <>
                        {renderSidebarHeader('LTM Storage', true)}
                        
                        <div className="flex-grow-1 overflow-auto p-3">
                            {loading ? (
                                <div className="text-secondary text-center mt-4">Loading...</div>
                            ) : (
                                <>
                                    <div className="d-flex justify-content-end mb-3">
                                        <button 
                                            onClick={handleClearMemories}
                                            className="btn btn-sm btn-outline-danger"
                                            disabled={memories.length === 0}
                                        >
                                            Clear All
                                        </button>
                                    </div>
                                    {memories.length === 0 ? (
                                        <div className="text-secondary text-center mt-4 small">No memories stored.</div>
                                    ) : (
                                        memories.map(mem => (
                                            <div key={mem.id} className="d-flex justify-content-between align-items-start mb-3 border-bottom border-secondary pb-2">
                                                <span className="text-light small text-break" style={{ fontSize: '13px', flex: 1, marginRight: '10px' }}>
                                                    {mem.text}
                                                </span>
                                                <button
                                                    onClick={() => handleDeleteMemory(mem.id)}
                                                    className="btn btn-link p-0 text-danger hover-opacity-100 opacity-75 mt-1"
                                                    title="Delete Memory"
                                                >
                                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6V20a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                                                </button>
                                            </div>
                                        ))
                                    )}
                                </>
                            )}
                        </div>
                    </>
                )}
            </div>
        </>
    );
}
