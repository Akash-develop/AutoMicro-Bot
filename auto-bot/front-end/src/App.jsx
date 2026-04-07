/**
 * src/App.jsx
 * Main chat UI — glassmorphism floating chatbot window
 */
import { useState, useCallback, useEffect, useRef } from 'react';
import TitleBar from './components/TitleBar.jsx';
import ChatWindow from './components/ChatWindow.jsx';
import InputBar from './components/InputBar.jsx';
import HistoryDrawer from './components/HistoryDrawer.jsx';
import SettingsDrawer from './components/SettingsDrawer.jsx';
import BubbleView from './components/BubbleView.jsx';
import LoadingScreen from './components/LoadingScreen.jsx';
import { streamMessage, clearHistory, getHistory, openTerminal } from './api/chat.js';
import { getCurrentWindow, LogicalSize, LogicalPosition } from '@tauri-apps/api/window';
import logo from './assets/automicro_bot_icon_v5.png';

// Generate a random session ID
function generateSessionId() {
  return `session_${crypto.randomUUID()}`;
}

// Get or create initial session ID
function getInitialSessionId() {
  let id = localStorage.getItem('automicro_session');
  if (!id) {
    id = generateSessionId();
    localStorage.setItem('automicro_session', id);
  }
  return id;
}
export default function App() {
  const [sessionId, setSessionId] = useState(getInitialSessionId());
  const [messages, setMessages] = useState([]);
  const [isTyping, setIsTyping] = useState(false);
  const [newMsgId, setNewMsgId] = useState(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [viewMode, setViewMode] = useState('mini'); // 'bubble' | 'mini' | 'full'
  const [isAppLoading, setIsAppLoading] = useState(true);
  const [theme, setTheme] = useState(localStorage.getItem('automicro_theme') || 'dark');
  const activeStream = useRef(null);
  const historyRequestId = useRef(0);

  const appWindow = getCurrentWindow();

  // On reload, ensure we never stay stuck in bubble window state.
  useEffect(() => {
    const ensureMiniDefaults = async () => {
      try {
        setViewMode('mini');
        await appWindow.setAlwaysOnTop(false);
        await appWindow.setSize(new LogicalSize(340, 450));
      } catch (err) {
        console.error('Failed to restore mini defaults on load:', err);
      }
    };
    ensureMiniDefaults();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load history if it's an existing session
  useEffect(() => {
    const reqId = ++historyRequestId.current;
    const loadSessionHistory = async () => {
      try {
        const history = await getHistory(sessionId);
        if (historyRequestId.current !== reqId) return;
        setMessages(history.map(m => ({
          id: `msg_${m.id}`,
          role: m.role,
          content: m.content,
          attachment: m.attachment,
          timestamp: m.timestamp
        })));
      } catch (err) {
        if (historyRequestId.current !== reqId) return;
        console.error("Failed to load history:", err);
        setMessages([]);
      }
    };
    loadSessionHistory();
  }, [sessionId]);

  const handleNormalMode = async () => {
    setIsAppLoading(true);
    setViewMode('normal');
    // Desktop size for Normal Mode
    await appWindow.setSize(new LogicalSize(1024, 768));
    await appWindow.center();
    await appWindow.setAlwaysOnTop(false);
    await appWindow.setFocus();
  };

  // Unified timer to handle isAppLoading transitions
  useEffect(() => {
    if (isAppLoading) {
      const timer = setTimeout(() => {
        setIsAppLoading(false);
      }, 2000); // Standard 2s loading duration
      return () => clearTimeout(timer);
    }
  }, [isAppLoading]);

  // Apply theme to document
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('automicro_theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  };

  const handleMinimizeToBubble = async () => {
    setViewMode('bubble');
    // Shrink window to bubble size (enough width for Dynamic Island expansion)
    await appWindow.setSize(new LogicalSize(200, 84));
    await appWindow.setAlwaysOnTop(true);
  };

  const handleRestoreFromBubble = async (mode) => {
    setIsAppLoading(true);
    setViewMode(mode);

    const width = mode === 'mini' ? 340 : 360;
    const height = mode === 'mini' ? 450 : 520;

    // Set size first
    await appWindow.setSize(new LogicalSize(width, height));
    await appWindow.setAlwaysOnTop(false);

    // Manual centering
    try {
      const monitor = await appWindow.currentMonitor();
      if (monitor) {
        const mSize = monitor.size;
        const scale = monitor.scaleFactor;
        const screenWidth = mSize.width / scale;
        const screenHeight = mSize.height / scale;

        const centerX = (screenWidth - width) / 2;
        const centerY = (screenHeight - height) / 2;

        await appWindow.setPosition(new LogicalPosition(centerX, centerY));
      } else {
        await appWindow.center();
      }
    } catch (err) {
      console.error("Manual centering failed, falling back:", err);
      await appWindow.center();
    }

    await appWindow.setFocus();
  };

  // Snapping logic for bubble mode
  useEffect(() => {
    let unlisten;
    let snapTimeout;

    const initSnapping = async () => {
      if (viewMode === 'bubble') {
        // Initial snap to bottom right
        const monitor = await appWindow.currentMonitor();
        if (monitor) {
          const { width, height } = monitor.size;
          const scale = monitor.scaleFactor;
          const lWidth = width / scale;
          const lHeight = height / scale;
          await appWindow.setPosition(new LogicalPosition(lWidth - 100, lHeight - 150));
        }

        // Listen for window movement
        unlisten = await appWindow.onMoved(async ({ payload: pos }) => {
          clearTimeout(snapTimeout);
          snapTimeout = setTimeout(async () => {
            const monitor = await appWindow.currentMonitor();
            if (!monitor) return;

            const { width, height } = monitor.size;
            const scale = monitor.scaleFactor;
            const lWidth = width / scale;
            const lHeight = height / scale;

            // Simple corner snapping logic
            const padding = 20;
            const bubbleSize = 84;
            const targetX = pos.x < lWidth / 2 ? padding : lWidth - bubbleSize - padding;
            const targetY = pos.y < lHeight / 2 ? padding : lHeight - bubbleSize - padding - 60; // 60 for taskbar/dock space

            await appWindow.setPosition(new LogicalPosition(targetX, targetY));
          }, 200); // Reduced to 200ms for snappier feedback
        });
      }
    };

    initSnapping();

    return () => {
      if (unlisten) unlisten();
      clearTimeout(snapTimeout);
    };
  }, [viewMode, appWindow]);

  // Add a message to the list
  const addMessage = (role, content, attachment = null) => {
    const msg = {
      id: `msg_${crypto.randomUUID()}`,
      role,
      content,
      attachment,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, msg]);
    setNewMsgId(msg.id);
    return msg;
  };

  const createToolCall = (toolName) => ({
    id: `tool_${crypto.randomUUID()}`,
    toolName,
    status: 'running', // running | completed | aborted | error
    startedAt: new Date().toISOString(),
    endedAt: null,
    output: '',
  });

  const handleSend = useCallback((text, attachment = null) => {
    addMessage('user', text, attachment);
    setIsTyping(true);

    const msgId = `msg_${crypto.randomUUID()}`;
    setMessages((prev) => [...prev, {
      id: msgId,
      role: 'assistant',
      content: '',
      commands: [], // tool calls
      timestamp: new Date().toISOString()
    }]);
    setNewMsgId(msgId);

    const stream = streamMessage(
      sessionId,
      text,
      (token) => {
        setMessages((prev) => prev.map(m => {
          if (m.id === msgId) {
            // If it's a new substring, append it. If it's a complete overwrite from the backend, we might need a different strategy.
            // Since this streams *token-by-token*, we append safely.
            return { ...m, content: m.content + token };
          }
          return m;
        }));
        setIsTyping(false);
      },
      (command) => {
        setMessages((prev) => prev.map(m => {
          if (m.id === msgId) {
            return { ...m, commands: [...(m.commands || []), createToolCall(command)] };
          }
          return m;
        }));
        // Reactivate typing indicator for post-tool thought
        setIsTyping(true);
      },
      (result) => {
        setMessages((prev) => prev.map(m => {
          if (m.id === msgId && m.commands && m.commands.length > 0) {
            const newCommands = [...m.commands];
            // Update the most recent running tool call; if none, fall back to last
            let idx = -1;
            for (let i = newCommands.length - 1; i >= 0; i--) {
              if (newCommands[i]?.status === 'running') {
                idx = i;
                break;
              }
            }
            if (idx === -1) idx = newCommands.length - 1;

            const prevCmd = newCommands[idx] || {};
            const output = (prevCmd.output || '') + (prevCmd.output ? '\n' : '') + String(result ?? '');
            newCommands[idx] = {
              ...prevCmd,
              output,
              status: 'completed',
              endedAt: new Date().toISOString(),
            };
            return { ...m, commands: newCommands };
          }
          return m;
        }));
        // Optional: show typing indicator as it generates the final textual answer
        setIsTyping(true);
      },
      () => {
        setIsTyping(false);
      },
      (err) => {
        setMessages((prev) => prev.map(m => m.id === msgId ? { ...m, content: m.content + `\n⚠️ Error: ${err.message}` } : m));
        setMessages((prev) => prev.map(m => {
          if (m.id !== msgId || !m.commands?.length) return m;
          const newCommands = [...m.commands];
          let idx = -1;
          for (let i = newCommands.length - 1; i >= 0; i--) {
            if (newCommands[i]?.status === 'running') {
              idx = i;
              break;
            }
          }
          if (idx === -1) return m;
          newCommands[idx] = {
            ...newCommands[idx],
            status: 'error',
            endedAt: new Date().toISOString(),
            output: (newCommands[idx].output || '') + (newCommands[idx].output ? '\n' : '') + `⚠️ Error: ${err.message}`,
          };
          return { ...m, commands: newCommands };
        }));
        setIsTyping(false);
      },
      attachment,
      (tool, args) => {
        setMessages((prev) => prev.map(m => {
          if (m.id !== msgId || !m.commands?.length) return m;
          const newCommands = [...m.commands];
          for (let i = newCommands.length - 1; i >= 0; i--) {
            if (newCommands[i]?.status === 'running') {
              newCommands[i] = { ...newCommands[i], toolArgs: args };
              break;
            }
          }
          return { ...m, commands: newCommands };
        }));
      }
    );

    activeStream.current = stream;
  }, [sessionId]);

  const handleStop = useCallback(() => {
    if (activeStream.current) {
      activeStream.current.close();
      activeStream.current = null;
      setIsTyping(false);
      
      // Clear any pending tool results in the active message
      if (newMsgId) {
        setMessages((prev) => prev.map(m => {
          if (m.id === newMsgId && m.commands) {
            return {
              ...m,
              commands: m.commands.map(cmd =>
                cmd.status === 'running'
                  ? { ...cmd, status: 'aborted', endedAt: new Date().toISOString() }
                  : cmd
              )
            };
          }
          return m;
        }));
      }
    }
  }, [newMsgId]);

  const handleOpenTerminal = useCallback(async () => {
    try {
      await openTerminal();
    } catch (err) {
      console.error("Failed to open terminal:", err);
      // Optional: show a toast/notification
    }
  }, []);

  const handleClearChat = useCallback(async () => {
    setMessages([]);
    setNewMsgId(null);
    try {
      await clearHistory(sessionId);
    } catch {
      // silently ignore — UI is already cleared
    }
  }, [sessionId]);

  const handleNewChat = useCallback(() => {
    const newId = generateSessionId();
    localStorage.setItem('automicro_session', newId);
    setSessionId(newId);
    setMessages([]);
    setNewMsgId(null);
  }, []);

  const handleSelectSession = useCallback((id) => {
    if (activeStream.current) {
      activeStream.current.close();
      activeStream.current = null;
    }
    setIsTyping(false);
    setNewMsgId(null);
    setMessages([]);
    setSessionId(id);
    localStorage.setItem('automicro_session', id);
    setIsDrawerOpen(false);
  }, []);

  if (viewMode === 'bubble') {
    return <BubbleView onRestore={handleRestoreFromBubble} isTyping={isTyping} onStop={handleStop} />;
  }

  if (isAppLoading) {
    return <LoadingScreen />;
  }

  // Choose layout based on viewMode
  if (viewMode === 'normal') {
    return (
      <div className="normal-layout-container w-100 h-100 d-flex overflow-hidden">
        {/* ── Sidebar ── */}
        <div className={`normal-sidebar ${isDrawerOpen ? '' : 'is-collapsed'}`}>
          <div className="normal-sidebar-header">
            <div className="d-flex align-items-center gap-2" style={{ WebkitAppRegion: 'no-drag' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline>
              </svg>
              <span style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-main)' }}>History</span>
            </div>
            <button
              className="normal-header-btn"
              onClick={() => setIsDrawerOpen(false)}
              style={{ width: '28px', height: '28px', borderRadius: '8px' }}
              title="Close sidebar"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="9" y1="3" x2="9" y2="21"/><polyline points="16 16 12 12 16 8"/>
              </svg>
            </button>
          </div>
          <div className="normal-sidebar-body">
            <HistoryDrawer
              isOpen={true}
              onClose={() => setIsDrawerOpen(false)}
              onSelectSession={handleSelectSession}
              onNewChat={handleNewChat}
              currentSessionId={sessionId}
              isPersistent={true}
            />
          </div>
        </div>

        {/* ── Main Area ── */}
        <div className="normal-main-content d-flex flex-column flex-grow-1 position-relative" style={{ minWidth: 0 }}>
          {/* Header */}
          <div className="normal-header" data-tauri-drag-region>
            <div className="normal-header-left">
              {!isDrawerOpen && (
                <button
                  className="normal-header-btn"
                  onClick={() => setIsDrawerOpen(true)}
                  title="Open sidebar"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="9" y1="3" x2="9" y2="21"/>
                  </svg>
                </button>
              )}

              <div className="normal-bot-avatar">
                <div className="normal-bot-avatar-icon">
                  <img src={logo} alt="AutoMicro-bot" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
                <div className="normal-bot-avatar-pulse pulse-glow" />
              </div>

              <div>
                <h1 className="m-0 d-flex align-items-center gap-2" style={{ fontSize: '15px', fontWeight: '600', color: 'var(--text-main)' }}>
                  <span className="text-gradient-primary">Auto</span> micro-Bot
                </h1>
                <span className="font-mono" style={{ fontSize: '11px', color: 'var(--muted-foreground)' }}>
                  online • macOS agent • v1.0
                </span>
              </div>
            </div>

            <div className="normal-header-right">
              <button className="normal-header-btn" onClick={() => setIsSettingsOpen(true)} title="Settings">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                </svg>
              </button>
              <button
                className="normal-header-btn with-label"
                onClick={() => handleRestoreFromBubble('mini')}
                title="Switch to floating mode"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="4 14 10 14 10 20"></polyline><polyline points="20 10 14 10 14 4"></polyline><line x1="14" y1="10" x2="21" y2="3"></line><line x1="3" y1="21" x2="10" y2="14"></line>
                </svg>
                <span className="font-mono" style={{ fontSize: '11px' }}>Float</span>
              </button>
              <button className="normal-header-btn" onClick={handleMinimizeToBubble} title="Minimize to bubble">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="5" y1="12" x2="19" y2="12" /></svg>
              </button>
              <button className="normal-header-btn" onClick={async () => (await getCurrentWindow()).close()} title="Close">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>
          </div>

          {/* Chat Area */}
          <div className="d-flex flex-column flex-grow-1 overflow-hidden">
            <div className="normal-chat-area">
              <ChatWindow
                messages={messages}
                isTyping={isTyping}
                newMsgId={newMsgId}
                isNormalMode={true}
                onSuggestionClick={(text) => handleSend(text)}
              />
              <InputBar onSend={handleSend} onStop={handleStop} disabled={isTyping} />
            </div>
          </div>

          <SettingsDrawer
            isOpen={isSettingsOpen}
            onClose={() => setIsSettingsOpen(false)}
            theme={theme}
            toggleTheme={toggleTheme}
          />
        </div>
      </div>
    );
  }

  return (
    <div className={`container-fluid h-100 d-flex align-items-center justify-content-center p-0 overflow-hidden ${viewMode === 'mini' ? 'mini-view' : ''}`} style={{ background: 'transparent' }}>
      <div className="glass-container position-relative">
        <div
          className="position-absolute translate-middle-x"
          style={{
            top: 0,
            left: '50%',
            width: '60%',
            height: '1px',
            background: 'linear-gradient(90deg, transparent, rgba(var(--accent-rgb),0.5), transparent)',
            pointerEvents: 'none',
            zIndex: 10
          }}
        />
        <TitleBar
          onClearChat={handleNewChat}
          onToggleHistory={() => setIsDrawerOpen(true)}
          onMinimize={handleMinimizeToBubble}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onNormalMode={handleNormalMode}
          onFloatingMode={() => handleRestoreFromBubble('mini')}
          onOpenTerminal={handleOpenTerminal}
          viewMode={viewMode}
        />
        <ChatWindow messages={messages} isTyping={isTyping} newMsgId={newMsgId} />
        <InputBar onSend={handleSend} onStop={handleStop} disabled={isTyping} />

        <HistoryDrawer
          isOpen={isDrawerOpen}
          onClose={() => setIsDrawerOpen(false)}
          onSelectSession={handleSelectSession}
          onNewChat={handleNewChat}
          currentSessionId={sessionId}
        />

        <SettingsDrawer
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          theme={theme}
          toggleTheme={toggleTheme}
        />
      </div>
    </div>
  );
}
