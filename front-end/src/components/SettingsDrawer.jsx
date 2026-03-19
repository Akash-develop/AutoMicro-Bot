/**
 * src/components/SettingsDrawer.jsx
 * Right-to-left drawer for managing agent tool permissions and memories.
 */
import { useState, useEffect } from 'react';
import { 
    getPermissions, updatePermissions, deletePermission, 
    getMemories, deleteMemory, clearMemories, 
    getLLMSettings, updateLLMSettings, getLLMHistory, activateLLMConfig, deleteLLMHistory 
} from '../api/settings.js';

export default function SettingsDrawer({ isOpen, onClose }) {
    const [activeMenu, setActiveMenu] = useState('main'); // 'main', 'permissions', 'memory'
    const [permissions, setPermissions] = useState({});
    const [lockedTools, setLockedTools] = useState([]);
    const [memories, setMemories] = useState([]);
    const [loading, setLoading] = useState(true);
    const [editingTool, setEditingTool] = useState(null);
    const [editValue, setEditValue] = useState("");
    const [llmSettings, setLlmSettings] = useState({
        provider: 'ollama',
        base_url: 'http://localhost:11434',
        api_key: '',
        model: 'llama3'
    });
    const [llmHistory, setLlmHistory] = useState([]);
    const [activeTab, setActiveTab] = useState('config'); // 'config', 'history'
    const [saving, setSaving] = useState(false);
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
        "create_excel_with_sample_data",
        "get_desktop_state",
        "control_app",
        "mouse_click",
        "keyboard_type",
        "move_mouse",
        "scroll_mouse",
        "drag_mouse",
        "press_keys",
        "scrape_web",
        "wait"
    ];

    const TOOL_LABELS = {
        "search_web": "Internet Search",
        "execute_terminal_command": "System Terminal",
        "get_desktop_state": "Desktop State",
        "control_app": "App Control",
        "mouse_click": "Mouse Click",
        "keyboard_type": "Keyboard Type",
        "move_mouse": "Move Mouse",
        "scroll_mouse": "Scroll Mouse",
        "drag_mouse": "Drag Mouse",
        "press_keys": "Press Keys",
        "scrape_web": "Scrape Web",
        "wait": "Wait",
        "get_active_tab_details": "Active Tab Info",
        "get_tab_content": "Read Page Text",
        "run_browser_js": "Run Browser JS"
    };

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

    useEffect(() => {
        if (isOpen && activeMenu === 'llm') {
            setLoading(true);
            Promise.all([getLLMSettings(), getLLMHistory()])
                .then(([settings, history]) => {
                    setLlmSettings(settings);
                    setLlmHistory(history);
                })
                .catch(err => console.error("Failed to fetch LLM data", err))
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

    const handleSaveLLM = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            await updateLLMSettings(llmSettings);
            const history = await getLLMHistory();
            setLlmHistory(history);
            alert("LLM Settings updated and saved to history.");
            setActiveTab('history');
        } catch (err) {
            alert("Failed to update LLM settings: " + err.message);
        } finally {
            setSaving(false);
        }
    };

    const handleActivateConfig = async (id) => {
        console.log("Activating config:", id);
        try {
            await activateLLMConfig(id);
            const [settings, history] = await Promise.all([getLLMSettings(), getLLMHistory()]);
            setLlmSettings(settings);
            setLlmHistory(history);
            alert("Configuration activated.");
        } catch (err) {
            console.error("Activation failed:", err);
            alert("Failed to activate configuration: " + err.message);
        }
    };

    const handleDeleteHistory = async (id) => {
        console.log("handleDeleteHistory CLICKED for ID:", id);
        try {
            console.log("Calling deleteLLMHistory API...");
            const res = await deleteLLMHistory(id);
            console.log("API returned success:", res);
            
            setLlmHistory(prev => {
                const updated = prev.filter(h => h.id != id);
                console.log("Old history count:", prev.length, "New history count:", updated.length);
                return updated;
            });
            alert("Deleted successfully.");
        } catch (err) {
            console.error("CRITICAL DELETE ERROR:", err);
            alert("Failed to delete history: " + err.message);
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

                            <button
                                onClick={() => setActiveMenu('llm')}
                                className="w-100 text-start btn btn-dark bg-transparent border-0 d-flex justify-content-between align-items-center py-3 px-3 mt-2 hover-bg-secondary"
                                style={{ transition: 'background-color 0.2s', borderRadius: '8px' }}
                            >
                                <span className="text-light fw-medium">Model Settings</span>
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

                                    {/* Built-in Tools Group */}
                                    <div className="mb-4">
                                        <div className="text-secondary small fw-bold mb-2 border-bottom border-secondary pb-1">Mac MCP Tools</div>
                                        {BUILTIN_TOOLS.map((tool) => {
                                            const isIndividuallyLocked = lockedTools.includes(tool);
                                            const effectiveLocked = isGlobalLocked || isIndividuallyLocked;
                                            const isEnabled = permissions[tool] || false;
                                            const displayName = TOOL_LABELS[tool] || formatToolName(tool);

                                            return (
                                                <div key={tool} className="d-flex justify-content-between align-items-center mb-2">
                                                    <div className="d-flex align-items-center gap-2">
                                                        <span className="text-light small" style={{ fontSize: '13px' }}>
                                                            {displayName}
                                                        </span>
                                                        <button
                                                            onClick={() => handleIndividualLock(tool)}
                                                            className="btn btn-link p-0 text-secondary hover-text-white d-flex align-items-center"
                                                            style={{ opacity: isGlobalLocked ? 0.3 : 0.6 }}
                                                            disabled={isGlobalLocked}
                                                        >
                                                            {isIndividuallyLocked ? (
                                                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                                                            ) : (
                                                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 9.9-1"></path></svg>
                                                            )}
                                                        </button>
                                                    </div>
                                                    <div className="form-check form-switch m-0">
                                                        <input
                                                            className="form-check-input"
                                                            type="checkbox"
                                                            checked={isEnabled}
                                                            onChange={() => !effectiveLocked && handleToggle(tool)}
                                                            disabled={effectiveLocked}
                                                        />
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>

                                    {/* Custom Rules Group */}
                                    <div className="mb-2 text-secondary small fw-bold border-bottom border-secondary pb-1">Custom Rules</div>
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
                ) : activeMenu === 'llm' ? (
                    <>
                        {renderSidebarHeader('Model Settings', true)}
                        
                        <div className="px-3 pt-2 d-flex gap-2 border-bottom border-secondary">
                            <button 
                                onClick={() => setActiveTab('config')}
                                className={`btn btn-sm flex-grow-1 py-2 rounded-0 border-0 ${activeTab === 'config' ? 'text-primary border-bottom border-primary active-tab-indicator' : 'text-secondary'}`}
                                style={{ fontSize: '0.85rem', fontWeight: activeTab === 'config' ? 'bold' : 'normal' }}
                            >
                                Configuration
                            </button>
                            <button 
                                onClick={() => setActiveTab('history')}
                                className={`btn btn-sm flex-grow-1 py-2 rounded-0 border-0 ${activeTab === 'history' ? 'text-primary border-bottom border-primary active-tab-indicator' : 'text-secondary'}`}
                                style={{ fontSize: '0.85rem', fontWeight: activeTab === 'history' ? 'bold' : 'normal' }}
                            >
                                History
                            </button>
                        </div>

                        <div className="flex-grow-1 overflow-auto p-3">
                            {loading ? (
                                <div className="text-secondary text-center mt-4">Loading...</div>
                            ) : activeTab === 'config' ? (
                                <form onSubmit={handleSaveLLM}>
                                    <div className="d-flex justify-content-between align-items-center mb-3">
                                        <span className="text-secondary small fw-bold">Current Active Model:</span>
                                        <span className="badge bg-primary-subtle text-primary border border-primary px-2 py-1" style={{ fontSize: '0.65rem' }}>
                                            {llmSettings.model}
                                        </span>
                                    </div>
                                    <div className="mb-3">
                                        <label className="form-label text-secondary small fw-bold">Provider</label>
                                        <select 
                                            className="form-select form-select-sm bg-dark text-white border-secondary"
                                            value={llmSettings.provider}
                                            onChange={e => setLlmSettings({...llmSettings, provider: e.target.value})}
                                        >
                                            <option value="ollama">Ollama (Local)</option>
                                            <option value="openai">OpenAI</option>
                                            <option value="gemini">Gemini (Google)</option>
                                            <option value="openai-compat">OpenAI-Compatible (Groq, etc.)</option>
                                        </select>
                                    </div>

                                    <div className="mb-3">
                                        <label className="form-label text-secondary small fw-bold">Base URL</label>
                                        <input 
                                            type="text" 
                                            className="form-control form-control-sm bg-dark text-white border-secondary"
                                            value={llmSettings.base_url}
                                            onChange={e => setLlmSettings({...llmSettings, base_url: e.target.value})}
                                            placeholder="e.g. http://localhost:11434"
                                        />
                                    </div>

                                    <div className="mb-3">
                                        <label className="form-label text-secondary small fw-bold">API Key</label>
                                        <input 
                                            type="password" 
                                            className="form-control form-control-sm bg-dark text-white border-secondary"
                                            value={llmSettings.api_key}
                                            onChange={e => setLlmSettings({...llmSettings, api_key: e.target.value})}
                                            placeholder="Not required for local"
                                        />
                                    </div>

                                    <div className="mb-3">
                                        <label className="form-label text-secondary small fw-bold">Model Name</label>
                                        <input 
                                            type="text" 
                                            className="form-control form-control-sm bg-dark text-white border-secondary"
                                            value={llmSettings.model}
                                            onChange={e => setLlmSettings({...llmSettings, model: e.target.value})}
                                            placeholder="e.g. llama3"
                                        />
                                    </div>

                                    <button 
                                        type="submit" 
                                        className="btn btn-sm btn-primary w-100 mt-2"
                                        disabled={saving}
                                    >
                                        {saving ? 'Saving...' : 'Save & Use'}
                                    </button>
                                </form>
                            ) : (
                                <div className="history-list">
                                    {llmHistory.length === 0 ? (
                                        <div className="text-secondary text-center mt-4 small">No saved configurations.</div>
                                    ) : (
                                        llmHistory.map(item => (
                                            <div key={item.id} className={`p-3 mb-2 rounded border ${item.is_active ? 'border-primary bg-primary-subtle bg-opacity-10' : 'border-secondary bg-dark bg-opacity-50'}`}>
                                                <div className="d-flex justify-content-between align-items-center mb-1">
                                                    <span className="text-white small fw-bold">{item.provider.toUpperCase()}</span>
                                                    <div className="d-flex align-items-center gap-2">
                                                        <span className="text-secondary" style={{ fontSize: '0.6rem' }}>
                                                            {new Date(item.created_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                                                        </span>
                                                        {item.is_active && (
                                                            <span className="badge bg-primary px-1 py-0" style={{ fontSize: '0.6rem' }}>ACTIVE</span>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="text-secondary" style={{ fontSize: '0.75rem' }}>
                                                    <div><strong>Model:</strong> {item.model}</div>
                                                    <div className="text-truncate"><strong>URL:</strong> {item.base_url}</div>
                                                </div>
                                                <div className="d-flex gap-2 mt-2">
                                                    {!item.is_active && (
                                                        <button 
                                                            onClick={() => handleActivateConfig(item.id)}
                                                            className="btn btn-xs btn-primary py-0 px-2 small"
                                                            style={{ fontSize: '0.7rem' }}
                                                        >
                                                            Use
                                                        </button>
                                                    )}
                                                    <button 
                                                        onClick={() => handleDeleteHistory(item.id)}
                                                        className="btn btn-xs btn-outline-danger py-0 px-2 small"
                                                        style={{ fontSize: '0.7rem' }}
                                                    >
                                                        Delete
                                                    </button>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
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
