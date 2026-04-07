/**
 * src/components/SettingsDrawer.jsx
 * Right-to-left drawer for managing agent tool permissions and LLM settings.
 */
import { useState, useEffect } from 'react';
import {
    getPermissions, updatePermissions, deletePermission,
    getLLMSettings, updateLLMSettings, getLLMHistory, activateLLMConfig, deleteLLMHistory,
    getAvailableModels,
    getPersonality, updatePersonality, resetPersonality, getPersonalityPresets,
    getKnowledgeStats
} from '../api/settings.js';

export default function SettingsDrawer({ isOpen, onClose, theme, toggleTheme }) {
    const [activeMenu, setActiveMenu] = useState('main'); // 'main', 'permissions', 'llm', ...
    const [permissions, setPermissions] = useState({});
    const [lockedTools, setLockedTools] = useState([]);
    const [loading, setLoading] = useState(true);
    const [editingTool, setEditingTool] = useState(null);
    const [editValue, setEditValue] = useState("");
    const [llmSettings, setLlmSettings] = useState({
        provider: 'ollama',
        base_url: '',
        api_key: '',
        model: ''
    });
    const [llmHistory, setLlmHistory] = useState([]);
    const [activeTab, setActiveTab] = useState('config'); // 'config', 'history'
    const [availableModels, setAvailableModels] = useState([]);
    const [fetchingModels, setFetchingModels] = useState(false);
    const [saving, setSaving] = useState(false);
    const [isGlobalLocked, setIsGlobalLocked] = useState(
        localStorage.getItem('toolSettingsLocked') === 'true'
    );

    // Humanoid Agent state
    const [humanoidConfig, setHumanoidConfig] = useState({
        warmth: 0.8, humor: 0.6, empathy: 0.9, directness: 0.5,
        curiosity: 0.7, formality: 0.3, verbosity: 0.5, enabled: true,
        tanglish: false,
        social_white_lies: false,
        fiction_mode: false,
    });
    const [humanoidPresets, setHumanoidPresets] = useState({});
    const [knowledgeStats, setKnowledgeStats] = useState({ total_chunks: 0, sources: {} });
    const [humanoidSaving, setHumanoidSaving] = useState(false);

    // Reset view when opening + load humanoid enabled state for badge
    useEffect(() => {
        if (isOpen) {
            setActiveMenu('main');
            getPersonality()
                .then(config => { if (config) setHumanoidConfig(prev => ({ ...prev, ...config })); })
                .catch(() => {});
        }
    }, [isOpen]);

    const toggleGlobalLock = () => {
        const newLockState = !isGlobalLocked;
        setIsGlobalLocked(newLockState);
        localStorage.setItem('toolSettingsLocked', newLockState);
        if (newLockState) setEditingTool(null);
    };

    const BUILTIN_TOOLS = ["execute_terminal_command"];

    const TOOL_LABELS = {
        "execute_terminal_command": "System Terminal",
    };

    const SAFETY_GUARDS = [
        "block_destructive_delete",
        "block_disk_operations",
        "block_system_power",
        "block_system_integrity",
        "block_remote_code_exec",
        "block_permission_changes",
        "block_fork_bomb",
    ];

    const GUARD_LABELS = {
        "block_destructive_delete": "Destructive Delete",
        "block_disk_operations": "Disk Format / Write",
        "block_system_power": "Shutdown / Reboot",
        "block_system_integrity": "System Integrity (SIP)",
        "block_remote_code_exec": "Remote Code Exec",
        "block_permission_changes": "Permission Changes",
        "block_fork_bomb": "Fork Bomb",
    };

    const HUMANOID_PRESET_LABELS = {
        raw_human: "Raw human",
        storyteller: "Storyteller",
    };

    const GUARD_DESCRIPTIONS = {
        "block_destructive_delete": "rm -rf /, rm -rf *, srm",
        "block_disk_operations": "mkfs, wipefs, dd, diskutil erase",
        "block_system_power": "shutdown, reboot",
        "block_system_integrity": "csrutil, nvram, launchctl",
        "block_remote_code_exec": "curl|sh, wget|sh",
        "block_permission_changes": "chmod 777 /, chown -R /",
        "block_fork_bomb": ":(){ :|:& };, disown",
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
        if (isOpen && activeMenu === 'humanoid') {
            setLoading(true);
            Promise.all([getPersonality(), getPersonalityPresets(), getKnowledgeStats()])
                .then(([config, presets, stats]) => {
                    if (config) setHumanoidConfig(prev => ({ ...prev, ...config }));
                    setHumanoidPresets(presets || {});
                    setKnowledgeStats(stats || { total_chunks: 0, sources: {} });
                })
                .catch(err => console.error("Failed to fetch humanoid settings", err))
                .finally(() => setLoading(false));
        }
    }, [isOpen, activeMenu]);

    useEffect(() => {
        if (isOpen && activeMenu === 'llm') {
            setLoading(true);
            // Only fetch history for the history tab. 
            // The Configuration tab starts fresh (empty) by user preference.
            getLLMHistory()
                .then((history) => {
                    setLlmHistory(history);
                })
                .catch(err => console.error("Failed to fetch LLM history", err))
                .finally(() => setLoading(false));
        }
    }, [isOpen, activeMenu]);

    // Fetch available models when provider, base_url or api_key changes
    useEffect(() => {
        const isCompatible = llmSettings.provider !== 'gemini';
        if (isOpen && activeMenu === 'llm' && activeTab === 'config' && isCompatible) {
            // For OpenAI, we use the hardcoded list (or we could fetch, but user wants base_url based)
            if (llmSettings.provider === 'openai' && !llmSettings.base_url) {
                setAvailableModels(['gpt-4o', 'gpt-4o-mini', 'o1-preview', 'o1-mini']);
                return;
            }

            const baseUrl = llmSettings.base_url || (llmSettings.provider === 'ollama' ? "http://localhost:11434" : "");

            if (!baseUrl && llmSettings.provider !== 'openai') {
                setAvailableModels([]);
                return;
            }

            setFetchingModels(true);
            getAvailableModels(llmSettings.provider, baseUrl, llmSettings.api_key)
                .then(data => {
                    setAvailableModels(data.models || []);
                })
                .catch(err => {
                    console.error("Failed to fetch available models", err);
                    setAvailableModels([]);
                })
                .finally(() => setFetchingModels(false));
        } else {
            setAvailableModels([]);
        }
    }, [isOpen, activeMenu, activeTab, llmSettings.provider, llmSettings.base_url, llmSettings.api_key]);

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

    const handleHumanoidToggle = async () => {
        const updated = { ...humanoidConfig, enabled: !humanoidConfig.enabled };
        setHumanoidConfig(updated);
        try {
            await updatePersonality(updated);
        } catch (err) {
            console.error("Failed to toggle humanoid mode", err);
            setHumanoidConfig(humanoidConfig);
        }
    };

    const handleTanglishToggle = async () => {
        const updated = { ...humanoidConfig, tanglish: !humanoidConfig.tanglish };
        setHumanoidConfig(updated);
        try {
            await updatePersonality(updated);
        } catch (err) {
            console.error("Failed to toggle Tanglish mode", err);
            setHumanoidConfig(humanoidConfig);
        }
    };

    const handleFictionToggle = async () => {
        const updated = { ...humanoidConfig, fiction_mode: !humanoidConfig.fiction_mode };
        setHumanoidConfig(updated);
        try {
            await updatePersonality(updated);
        } catch (err) {
            console.error("Failed to toggle Fiction mode", err);
            setHumanoidConfig(humanoidConfig);
        }
    };

    const handleSliderChange = (trait, value) => {
        setHumanoidConfig(prev => ({ ...prev, [trait]: parseFloat(value) }));
    };

    const handleSaveHumanoid = async () => {
        setHumanoidSaving(true);
        try {
            await updatePersonality(humanoidConfig);
        } catch (err) {
            console.error("Failed to save humanoid config", err);
        } finally {
            setHumanoidSaving(false);
        }
    };

    const handleApplyPreset = (presetName) => {
        const preset = humanoidPresets[presetName];
        if (preset) {
            setHumanoidConfig(prev => ({ ...prev, ...preset }));
        }
    };

    const handleResetHumanoid = async () => {
        try {
            const result = await resetPersonality();
            if (result.config) setHumanoidConfig(prev => ({ ...prev, ...result.config }));
        } catch (err) {
            console.error("Failed to reset humanoid config", err);
        }
    };

    const formatToolName = (name) => {
        return name.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
    };

    // Sub-renderers for cleaner code structure
    const renderSidebarHeader = (title, showBack = false) => (
        <div className="p-3 border-bottom d-flex justify-content-between align-items-center" style={{ borderColor: 'var(--glass-border)' }}>
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
                <h6 className="m-0 fw-bold d-flex align-items-center gap-2" style={{ color: 'var(--text-main)' }}>
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
            <button onClick={onClose} className={`btn-close ${theme === 'dark' ? 'btn-close-white' : ''}`} style={{ fontSize: '0.8rem' }} />
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
                    background: 'var(--drawer-bg)', backdropFilter: 'blur(28px)',
                    borderLeft: '1px solid var(--glass-border)',
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
                                className="w-100 text-start btn bg-transparent border-0 d-flex justify-content-between align-items-center py-3 px-3 hover-bg-secondary"
                                style={{ transition: 'background-color 0.2s', borderRadius: '8px' }}
                            >
                                <span className="fw-medium" style={{ color: 'var(--text-main)' }}>Tool Permissions</span>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-secondary"><polyline points="9 18 15 12 9 6"></polyline></svg>
                            </button>

                            <button
                                onClick={() => setActiveMenu('llm')}
                                className="w-100 text-start btn bg-transparent border-0 d-flex justify-content-between align-items-center py-3 px-3 mt-2 hover-bg-secondary"
                                style={{ transition: 'background-color 0.2s', borderRadius: '8px' }}
                            >
                                <span className="fw-medium" style={{ color: 'var(--text-main)' }}>Model Settings</span>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-secondary"><polyline points="9 18 15 12 9 6"></polyline></svg>
                            </button>

                            <button
                                onClick={() => setActiveMenu('humanoid')}
                                className="w-100 text-start btn bg-transparent border-0 d-flex justify-content-between align-items-center py-3 px-3 mt-2 hover-bg-secondary"
                                style={{ transition: 'background-color 0.2s', borderRadius: '8px' }}
                            >
                                <div className="d-flex align-items-center gap-2">
                                    <span className="fw-medium" style={{ color: 'var(--text-main)' }}>Humanoid Chat Agent</span>
                                    <span
                                        className="badge px-1 py-0"
                                        style={{
                                            fontSize: '0.55rem',
                                            background: humanoidConfig.enabled ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.08)',
                                            color: humanoidConfig.enabled ? '#22c55e' : 'var(--muted-foreground)',
                                            border: `1px solid ${humanoidConfig.enabled ? 'rgba(34,197,94,0.3)' : 'var(--glass-border)'}`,
                                        }}
                                    >
                                        {humanoidConfig.enabled ? 'ON' : 'OFF'}
                                    </span>
                                </div>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-secondary"><polyline points="9 18 15 12 9 6"></polyline></svg>
                            </button>

                            <button
                                onClick={toggleTheme}
                                className="w-100 text-start btn bg-transparent border-0 d-flex justify-content-between align-items-center py-3 px-3 mt-2 hover-bg-secondary"
                                style={{ transition: 'background-color 0.2s', borderRadius: '8px' }}
                            >
                                <span className="fw-medium" style={{ color: 'var(--text-main)' }}>Appearance: {theme.charAt(0).toUpperCase() + theme.slice(1)}</span>
                                {theme === 'dark' ? (
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-secondary">
                                        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
                                    </svg>
                                ) : (
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-secondary">
                                        <circle cx="12" cy="12" r="5"></circle>
                                        <line x1="12" y1="1" x2="12" y2="3"></line>
                                        <line x1="12" y1="21" x2="12" y2="23"></line>
                                        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
                                        <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
                                        <line x1="1" y1="12" x2="3" y2="12"></line>
                                        <line x1="21" y1="12" x2="23" y2="12"></line>
                                        <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
                                        <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
                                    </svg>
                                )}
                            </button>

                            <button
                                onClick={() => setActiveMenu('about')}
                                className="w-100 text-start btn bg-transparent border-0 d-flex justify-content-between align-items-center py-3 px-3 mt-2 hover-bg-secondary"
                                style={{ transition: 'background-color 0.2s', borderRadius: '8px' }}
                            >
                                <span className="fw-medium" style={{ color: 'var(--text-main)' }}>About AutoMicro-Bot</span>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-secondary"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
                            </button>

                            <div className="mt-4 px-3 font-mono" style={{ fontSize: '10px', color: 'var(--muted-foreground)', opacity: 0.5 }}>
                                v0.1.0-alpha • Build 2026.03.27
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
                                            className="form-control form-control-sm border-secondary"
                                            style={{ background: 'var(--input-bg)', color: 'var(--text-main)' }}
                                            placeholder="Add custom rule..."
                                            disabled={isGlobalLocked}
                                        />
                                        <button type="submit" className="btn btn-sm btn-outline-success" disabled={isGlobalLocked}>+</button>
                                    </form>

                                    {/* Built-in Tools Group */}
                                    <div className="mb-4">
                                        <div className="text-secondary small fw-bold mb-2 border-bottom border-secondary pb-1">Terminal</div>
                                        {BUILTIN_TOOLS.map((tool) => {
                                            const isIndividuallyLocked = lockedTools.includes(tool);
                                            const effectiveLocked = isGlobalLocked || isIndividuallyLocked;
                                            const isEnabled = permissions[tool] || false;
                                            const displayName = TOOL_LABELS[tool] || formatToolName(tool);

                                            return (
                                                <div key={tool} className="d-flex justify-content-between align-items-center mb-2">
                                                    <div className="d-flex align-items-center gap-2">
                                                        <span className="small" style={{ fontSize: '13px', color: 'var(--text-main)' }}>
                                                            {displayName}
                                                        </span>
                                                        <button
                                                            onClick={() => handleIndividualLock(tool)}
                                                            className="btn btn-link p-0 text-secondary hover-accent-color d-flex align-items-center"
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

                                    {/* Safety Guards Group */}
                                    <div className="mb-4">
                                        <div className="text-secondary small fw-bold mb-2 border-bottom border-secondary pb-1 d-flex align-items-center gap-1">
                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
                                            Blocked Patterns
                                        </div>
                                        <div className="mb-2" style={{ fontSize: '10px', color: 'var(--muted-foreground)', lineHeight: 1.4 }}>
                                            ON = blocked (safe). Turn OFF to allow.
                                        </div>
                                        {SAFETY_GUARDS.map((guard) => {
                                            const isIndividuallyLocked = lockedTools.includes(guard);
                                            const effectiveLocked = isGlobalLocked || isIndividuallyLocked;
                                            const isEnabled = permissions[guard] !== undefined ? permissions[guard] : true;
                                            const label = GUARD_LABELS[guard] || formatToolName(guard);
                                            const desc = GUARD_DESCRIPTIONS[guard] || '';

                                            return (
                                                <div key={guard} className="d-flex justify-content-between align-items-start mb-3">
                                                    <div className="d-flex flex-column" style={{ maxWidth: '170px' }}>
                                                        <span className="small" style={{ fontSize: '12px', color: 'var(--text-main)', fontWeight: 500 }}>
                                                            {label}
                                                        </span>
                                                        {desc && (
                                                            <span className="font-mono" style={{ fontSize: '9px', color: 'var(--muted-foreground)', marginTop: '2px', lineHeight: 1.3 }}>
                                                                {desc}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="form-check form-switch m-0 flex-shrink-0">
                                                        <input
                                                            className="form-check-input"
                                                            type="checkbox"
                                                            checked={isEnabled}
                                                            onChange={() => !effectiveLocked && handleToggle(guard)}
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
                                                                className="form-control form-control-sm border-primary"
                                                                style={{ background: 'var(--input-bg)', color: 'var(--text-main)' }}
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
                                                                    className={`small text-break ${!effectiveLocked ? 'cursor-pointer' : ''}`}
                                                                    style={{
                                                                        fontSize: '13px',
                                                                        maxWidth: '140px',
                                                                        cursor: !effectiveLocked ? 'pointer' : 'default',
                                                                        opacity: effectiveLocked ? 0.7 : 1,
                                                                        color: 'var(--text-main)'
                                                                    }}
                                                                    onClick={() => { if (!effectiveLocked) startEdit(tool); }}
                                                                    title={effectiveLocked ? "Unlock to edit" : "Click to edit rule"}
                                                                >
                                                                    {formatToolName(tool)}
                                                                </span>

                                                                <button
                                                                    onClick={() => handleIndividualLock(tool)}
                                                                    className="btn btn-link p-0 ms-2 text-secondary hover-accent-color d-flex align-items-center"
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
                                            className="form-select form-select-sm border-secondary"
                                            style={{ background: 'var(--input-bg)', color: 'var(--text-main)' }}
                                            value={llmSettings.provider}
                                            onChange={e => {
                                                const newProvider = e.target.value;
                                                const updates = { provider: newProvider };

                                                // Only reset if moving to/from Gemini
                                                if (newProvider === 'gemini' || llmSettings.provider === 'gemini') {
                                                    updates.base_url = '';
                                                    updates.api_key = '';
                                                    updates.model = '';
                                                }

                                                setLlmSettings({
                                                    ...llmSettings,
                                                    ...updates
                                                });
                                            }}
                                        >
                                            <option value="ollama">Ollama (Local)</option>
                                            <option value="ollama-cloud">Ollama (Cloud)</option>
                                            <option value="openai">OpenAI</option>
                                            <option value="gemini">Gemini (Google)</option>
                                            <option value="openai-compat">OpenAI-Compatible (Groq, etc.)</option>
                                        </select>
                                    </div>


                                    {llmSettings.provider !== 'gemini' && (
                                        <div className="mb-3">
                                            <label className="form-label text-secondary small fw-bold">Base URL</label>
                                            <input
                                                type="text"
                                                className="form-control form-control-sm border-secondary"
                                                style={{ background: 'var(--input-bg)', color: 'var(--text-main)' }}
                                                value={llmSettings.base_url}
                                                onChange={e => {
                                                    setLlmSettings({ ...llmSettings, base_url: e.target.value });
                                                }}
                                                placeholder={
                                                    llmSettings.provider === 'ollama' ? "http://localhost:11434" :
                                                        llmSettings.provider === 'openai-compat' ? "https://your-api-endpoint.com/v1" :
                                                            "https://your-api-endpoint.com/v1"
                                                }
                                            />
                                            <div className="mt-1 text-secondary" style={{ fontSize: '0.65rem' }}>
                                                {llmSettings.provider === 'ollama' ? "Default: http://localhost:11434" :
                                                    "Ensure your URL includes /v1 if required by the provider."}
                                            </div>
                                            {llmSettings.base_url.includes('ollama.com') && (
                                                <div className="mt-1 text-warning" style={{ fontSize: '0.65rem', fontWeight: 'bold' }}>
                                                    ⚠️ Warning: ollama.com is a website, NOT an API host.
                                                    Try your dedicated API endpoint.
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    <div className="mb-3">
                                        <label className="form-label text-secondary small fw-bold">API Key</label>
                                        <input
                                            type="password"
                                            className="form-control form-control-sm border-secondary"
                                            style={{ background: 'var(--input-bg)', color: 'var(--text-main)' }}
                                            value={llmSettings.api_key}
                                            onChange={e => setLlmSettings({ ...llmSettings, api_key: e.target.value })}
                                            placeholder={llmSettings.provider === 'ollama' ? "Not required for local" : "Enter your API Key"}
                                        />
                                    </div>

                                    <div className="mb-3">
                                        <label className="form-label text-secondary small fw-bold">Model Name</label>
                                        {(llmSettings.provider === 'ollama' || llmSettings.provider === 'ollama-cloud' || llmSettings.provider === 'openai-compat') && availableModels.length > 0 ? (
                                            <div className="position-relative">
                                                <select
                                                    className="form-select form-select-sm border-secondary"
                                                    style={{ background: 'var(--input-bg)', color: 'var(--text-main)' }}
                                                    value={llmSettings.model}
                                                    onChange={e => setLlmSettings({ ...llmSettings, model: e.target.value })}
                                                >
                                                    <option value="">Select a model...</option>
                                                    {availableModels.map(model => (
                                                        <option key={model} value={model}>{model}</option>
                                                    ))}
                                                </select>
                                                {fetchingModels && (
                                                    <div className="position-absolute end-0 top-50 translate-middle-y pe-4">
                                                        <div className="spinner-border spinner-border-sm text-secondary" role="status">
                                                            <span className="visually-hidden">Loading...</span>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        ) : (
                                            <div className="position-relative">
                                                <input
                                                    type="text"
                                                    className="form-control form-control-sm border-secondary"
                                                    style={{ background: 'var(--input-bg)', color: 'var(--text-main)' }}
                                                    value={llmSettings.model}
                                                    onChange={e => setLlmSettings({ ...llmSettings, model: e.target.value })}
                                                    placeholder={
                                                        llmSettings.provider === 'gemini' ? "e.g. gemini-1.5-flash" :
                                                            llmSettings.provider === 'openai-compat' ? "e.g. moonshotai/Kimi-V1.5" :
                                                                "e.g. llama3"
                                                    }
                                                />
                                                {(llmSettings.provider === 'ollama' || llmSettings.provider === 'ollama-cloud' || llmSettings.provider === 'openai-compat') && fetchingModels && (
                                                    <div className="position-absolute end-0 top-50 translate-middle-y pe-2">
                                                        <div className="spinner-border spinner-border-sm text-secondary" role="status"></div>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                        <div className="mt-1 text-info" style={{ fontSize: '0.65rem' }}>
                                            {llmSettings.provider === 'ollama' || llmSettings.provider === 'ollama-cloud' || llmSettings.provider === 'openai-compat' ?
                                                (availableModels.length > 0 ? `${availableModels.length} models discovered.` : (fetchingModels ? "Fetching models..." : "No models found or config incomplete.")) :
                                                "Cloud models require a stable internet connection."
                                            }
                                        </div>
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
                                            <div key={item.id} className={`p-3 mb-2 rounded border ${item.is_active ? 'border-primary bg-primary-subtle bg-opacity-10' : 'border-secondary'}`} style={{ background: item.is_active ? '' : 'var(--input-bg)' }}>
                                                <div className="d-flex justify-content-between align-items-center mb-1">
                                                    <span className="small fw-bold" style={{ color: 'var(--text-main)' }}>{item.provider.toUpperCase()}</span>
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
                ) : activeMenu === 'humanoid' ? (
                    <>
                        {renderSidebarHeader('Humanoid Agent', true)}

                        <div className="flex-grow-1 overflow-auto p-3">
                            {loading ? (
                                <div className="text-secondary text-center mt-4">Loading...</div>
                            ) : (
                                <>
                                    {/* Master Toggle */}
                                    <div
                                        className="d-flex justify-content-between align-items-center p-3 mb-3 rounded"
                                        style={{
                                            background: humanoidConfig.enabled ? 'rgba(34,197,94,0.08)' : 'var(--input-bg)',
                                            border: `1px solid ${humanoidConfig.enabled ? 'rgba(34,197,94,0.25)' : 'var(--glass-border)'}`,
                                            transition: 'all 0.3s ease',
                                        }}
                                    >
                                        <div>
                                            <div className="small fw-bold" style={{ color: 'var(--text-main)' }}>Enable Humanoid Mode</div>
                                            <div style={{ fontSize: '0.65rem', color: 'var(--muted-foreground)', marginTop: '2px' }}>
                                                {humanoidConfig.enabled ? 'Agent responds with human-like empathy' : 'Standard AI responses'}
                                            </div>
                                        </div>
                                        <div className="form-check form-switch m-0">
                                            <input
                                                className="form-check-input"
                                                type="checkbox"
                                                checked={humanoidConfig.enabled}
                                                onChange={handleHumanoidToggle}
                                                style={{ width: '2.5em', height: '1.25em' }}
                                            />
                                        </div>
                                    </div>

                                    {/* Tanglish Language Toggle */}
                                    <div
                                        className="d-flex justify-content-between align-items-center p-3 mb-3 rounded"
                                        style={{
                                            background: humanoidConfig.tanglish ? 'rgba(251,191,36,0.08)' : 'var(--input-bg)',
                                            border: `1px solid ${humanoidConfig.tanglish ? 'rgba(251,191,36,0.25)' : 'var(--glass-border)'}`,
                                            transition: 'all 0.3s ease',
                                        }}
                                    >
                                        <div>
                                            <div className="small fw-bold d-flex align-items-center gap-1" style={{ color: 'var(--text-main)' }}>
                                                Tanglish Mode
                                                <span
                                                    className="badge px-1 py-0"
                                                    style={{
                                                        fontSize: '0.5rem',
                                                        background: humanoidConfig.tanglish ? 'rgba(251,191,36,0.2)' : 'rgba(255,255,255,0.06)',
                                                        color: humanoidConfig.tanglish ? '#fbbf24' : 'var(--muted-foreground)',
                                                        border: `1px solid ${humanoidConfig.tanglish ? 'rgba(251,191,36,0.4)' : 'var(--glass-border)'}`,
                                                    }}
                                                >
                                                    {humanoidConfig.tanglish ? 'ON' : 'OFF'}
                                                </span>
                                            </div>
                                            <div style={{ fontSize: '0.6rem', color: 'var(--muted-foreground)', marginTop: '2px' }}>
                                                {humanoidConfig.tanglish ? 'Tamil + English mix la pesuvom!' : 'Chat in Tamil-English Tanglish'}
                                            </div>
                                        </div>
                                        <div className="form-check form-switch m-0">
                                            <input
                                                className="form-check-input"
                                                type="checkbox"
                                                checked={humanoidConfig.tanglish || false}
                                                onChange={handleTanglishToggle}
                                                style={{ width: '2.5em', height: '1.25em' }}
                                            />
                                        </div>
                                    </div>

                                    {/* Fiction / story mode */}
                                    <div
                                        className="d-flex justify-content-between align-items-center p-3 mb-3 rounded"
                                        style={{
                                            background: humanoidConfig.fiction_mode ? 'rgba(167,139,250,0.1)' : 'var(--input-bg)',
                                            border: `1px solid ${humanoidConfig.fiction_mode ? 'rgba(167,139,250,0.35)' : 'var(--glass-border)'}`,
                                            transition: 'all 0.3s ease',
                                        }}
                                    >
                                        <div>
                                            <div className="small fw-bold d-flex align-items-center gap-1" style={{ color: 'var(--text-main)' }}>
                                                Fiction / story mode
                                                <span
                                                    className="badge px-1 py-0"
                                                    style={{
                                                        fontSize: '0.5rem',
                                                        background: humanoidConfig.fiction_mode ? 'rgba(167,139,250,0.25)' : 'rgba(255,255,255,0.06)',
                                                        color: humanoidConfig.fiction_mode ? '#c4b5fd' : 'var(--muted-foreground)',
                                                        border: `1px solid ${humanoidConfig.fiction_mode ? 'rgba(167,139,250,0.45)' : 'var(--glass-border)'}`,
                                                    }}
                                                >
                                                    {humanoidConfig.fiction_mode ? 'ON' : 'OFF'}
                                                </span>
                                            </div>
                                            <div style={{ fontSize: '0.6rem', color: 'var(--muted-foreground)', marginTop: '2px' }}>
                                                Creative / roleplay only — not for real secrets. Or start a message with [FICTION]
                                            </div>
                                        </div>
                                        <div className="form-check form-switch m-0">
                                            <input
                                                className="form-check-input"
                                                type="checkbox"
                                                checked={!!humanoidConfig.fiction_mode}
                                                onChange={handleFictionToggle}
                                                style={{ width: '2.5em', height: '1.25em' }}
                                            />
                                        </div>
                                    </div>

                                    {/* Knowledge Stats */}
                                    <div className="mb-3 p-2 rounded" style={{ background: 'var(--input-bg)', border: '1px solid var(--glass-border)' }}>
                                        <div className="d-flex justify-content-between align-items-center">
                                            <span className="text-secondary" style={{ fontSize: '0.7rem' }}>Knowledge Base</span>
                                            <span className="badge bg-primary bg-opacity-10 text-primary border border-primary border-opacity-25 px-2" style={{ fontSize: '0.65rem' }}>
                                                {knowledgeStats.total_chunks?.toLocaleString() || 0} chunks
                                            </span>
                                        </div>
                                        <div className="text-secondary mt-1" style={{ fontSize: '0.6rem' }}>
                                            {Object.keys(knowledgeStats.sources || {}).length} PDF sources loaded
                                        </div>
                                    </div>

                                    {/* Personality Sliders */}
                                    <div className={`${!humanoidConfig.enabled ? 'opacity-50' : ''}`} style={{ transition: 'opacity 0.3s', pointerEvents: humanoidConfig.enabled ? 'auto' : 'none' }}>
                                        <div className="text-secondary small fw-bold mb-2 border-bottom border-secondary pb-1 d-flex align-items-center gap-1">
                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
                                            Personality Traits
                                        </div>

                                        {/* Presets */}
                                        <div className="d-flex gap-1 flex-wrap mb-3">
                                            {Object.keys(humanoidPresets).map(preset => (
                                                <button
                                                    key={preset}
                                                    onClick={() => handleApplyPreset(preset)}
                                                    className="btn btn-sm px-2 py-0"
                                                    style={{
                                                        fontSize: '0.6rem',
                                                        background: 'var(--input-bg)',
                                                        border: '1px solid var(--glass-border)',
                                                        color: 'var(--text-main)',
                                                        borderRadius: '12px',
                                                    }}
                                                >
                                                    {HUMANOID_PRESET_LABELS[preset]
                                                        ?? (preset.charAt(0).toUpperCase() + preset.slice(1))}
                                                </button>
                                            ))}
                                        </div>

                                        {[
                                            { key: 'warmth', label: 'Warmth', icon: '~', low: 'Cool', high: 'Warm' },
                                            { key: 'empathy', label: 'Empathy', icon: '~', low: 'Neutral', high: 'Deep' },
                                            { key: 'humor', label: 'Humor', icon: '~', low: 'Serious', high: 'Playful' },
                                            { key: 'directness', label: 'Directness', icon: '~', low: 'Gentle', high: 'Direct' },
                                            { key: 'curiosity', label: 'Curiosity', icon: '~', low: 'Reserved', high: 'Curious' },
                                            { key: 'formality', label: 'Formality', icon: '~', low: 'Casual', high: 'Formal' },
                                            { key: 'verbosity', label: 'Verbosity', icon: '~', low: 'Concise', high: 'Detailed' },
                                        ].map(({ key, label, low, high }) => (
                                            <div key={key} className="mb-3">
                                                <div className="d-flex justify-content-between align-items-center mb-1">
                                                    <span className="small" style={{ fontSize: '0.75rem', color: 'var(--text-main)', fontWeight: 500 }}>{label}</span>
                                                    <span className="font-mono" style={{ fontSize: '0.65rem', color: 'var(--accent)', fontWeight: 600 }}>
                                                        {Math.round((humanoidConfig[key] || 0) * 100)}%
                                                    </span>
                                                </div>
                                                <input
                                                    type="range"
                                                    className="form-range"
                                                    min="0" max="1" step="0.05"
                                                    value={humanoidConfig[key] || 0}
                                                    onChange={e => handleSliderChange(key, e.target.value)}
                                                    style={{ accentColor: 'var(--accent)' }}
                                                />
                                                <div className="d-flex justify-content-between" style={{ fontSize: '0.55rem', color: 'var(--muted-foreground)', marginTop: '-2px' }}>
                                                    <span>{low}</span>
                                                    <span>{high}</span>
                                                </div>
                                            </div>
                                        ))}

                                        {/* Action Buttons */}
                                        <div className="d-flex gap-2 mt-3">
                                            <button
                                                onClick={handleSaveHumanoid}
                                                className="btn btn-sm btn-primary flex-grow-1"
                                                disabled={humanoidSaving}
                                            >
                                                {humanoidSaving ? 'Saving...' : 'Save Personality'}
                                            </button>
                                            <button
                                                onClick={handleResetHumanoid}
                                                className="btn btn-sm btn-outline-secondary"
                                                title="Reset to defaults"
                                            >
                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path></svg>
                                            </button>
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    </>
                ) : activeMenu === 'about' ? (
                    <>
                        {renderSidebarHeader('About', true)}

                        <div className="flex-grow-1 overflow-auto p-4 d-flex flex-column align-items-center animate-fade-in-up">
                            <div className="mb-5 mt-4 text-center">
                                <div className="logo-pulse-glow mb-4">
                                    <div className="d-inline-block glow-primary-strong" style={{ padding: '16px', borderRadius: '24px', background: 'var(--accent-subtle)', border: '1px solid rgba(var(--accent-rgb), 0.2)' }}>
                                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/>
                                        </svg>
                                    </div>
                                </div>
                                <h3 className="fw-bold mb-1" style={{ color: 'var(--text-main)', letterSpacing: '-0.01em' }}>
                                    <span className="text-gradient-primary">Auto</span> micro-Bot
                                </h3>
                                <div className="font-mono" style={{ fontSize: '11px', color: 'var(--muted-foreground)', letterSpacing: '0.1em' }}>DESKTOP INTELLIGENCE</div>
                            </div>

                            <div className="about-card-premium w-100 mb-4">
                                <div className="d-flex justify-content-between align-items-center mb-3">
                                    <span className="text-secondary small fw-bold text-uppercase" style={{ letterSpacing: '0.5px' }}>Current Version</span>
                                    <span className="badge bg-primary bg-opacity-10 text-primary border border-primary border-opacity-25 px-2 py-1" style={{ fontSize: '0.75rem' }}>0.1.0-alpha</span>
                                </div>

                                <div className="d-flex justify-content-between align-items-center">
                                    <span className="text-secondary small fw-bold text-uppercase" style={{ letterSpacing: '0.5px' }}>App Status</span>
                                    <div className="d-flex align-items-center">
                                        <div className="status-dot-pulse"></div>
                                        <span className="text-success small fw-bold">Up to date</span>
                                    </div>
                                </div>
                            </div>

                            <div className="w-100 d-flex gap-2">
                                <a href="https://github.com/akash" target="_blank" rel="noopener noreferrer" className="btn flex-grow-1 py-2 d-flex align-items-center justify-content-center gap-2" style={{ background: 'var(--input-bg)', border: '1px solid var(--glass-border)', color: 'var(--text-main)', borderRadius: '12px', transition: 'all 0.2s' }}>
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"></path></svg>
                                    <span className="small">GitHub</span>
                                </a>
                                <a href="https://automicro.ai" target="_blank" rel="noopener noreferrer" className="btn flex-grow-1 py-2 d-flex align-items-center justify-content-center gap-2" style={{ background: 'var(--input-bg)', border: '1px solid var(--glass-border)', color: 'var(--text-main)', borderRadius: '12px', transition: 'all 0.2s' }}>
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>
                                    <span className="small">Website</span>
                                </a>
                            </div>

                            <div className="mt-auto w-100 text-center text-secondary pt-4 border-top" style={{ borderColor: 'var(--glass-border)', fontSize: '10px', opacity: 0.5 }}>
                                <p className="mb-0 text-uppercase" style={{ letterSpacing: '1px' }}>© 2026 AutoMicro Technologies</p>
                            </div>
                        </div>
                    </>
                ) : null}
            </div>
        </>
    );
}
