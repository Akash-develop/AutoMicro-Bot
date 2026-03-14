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
import { streamMessage, clearHistory, getHistory } from './api/chat.js';
import { getCurrentWindow, LogicalSize, LogicalPosition } from '@tauri-apps/api/window';

// Generate a random session ID
function generateSessionId() {
  return `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
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
  const activeStream = useRef(null);

  const appWindow = getCurrentWindow();

  // Load history if it's an existing session
  useEffect(() => {
    const loadSessionHistory = async () => {
      try {
        const history = await getHistory(sessionId);
        setMessages(history.map(m => ({
          id: `msg_${m.id}`,
          role: m.role,
          content: m.content,
          timestamp: m.timestamp
        })));
      } catch (err) {
        console.error("Failed to load history:", err);
      } finally {
        // Initial load is handled by the useEffect above
        // We'll use a unified timer effect for isAppLoading
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
          }, 500); // 500ms after move stops
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
  const addMessage = (role, content) => {
    const msg = {
      id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      role,
      content,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, msg]);
    setNewMsgId(msg.id);
    return msg;
  };

  const handleSend = useCallback((text, attachment = null) => {
    addMessage('user', text);
    setIsTyping(true);

    const msgId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    setMessages((prev) => [...prev, {
      id: msgId,
      role: 'assistant',
      content: '',
      commands: [],
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
            return { ...m, commands: [...(m.commands || []), { command, result: null }] };
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
            newCommands[newCommands.length - 1].result = result;
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
        setIsTyping(false);
      },
      attachment
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
                cmd.result === null ? { ...cmd, result: 'Stopped' } : cmd
              )
            };
          }
          return m;
        }));
      }
    }
  }, [newMsgId]);

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
        <HistoryDrawer
          isOpen={isDrawerOpen} // Use state for visibility
          onClose={() => setIsDrawerOpen(false)} 
          onSelectSession={handleSelectSession}
          onNewChat={handleNewChat}
          currentSessionId={sessionId}
          isPersistent={true}
        />
        <div className="normal-main-content d-flex flex-column flex-grow-1 position-relative">
          <TitleBar
            onClearChat={handleNewChat}
            onToggleHistory={() => setIsDrawerOpen(!isDrawerOpen)}
            onMinimize={handleMinimizeToBubble}
            onOpenSettings={() => setIsSettingsOpen(true)}
            onNormalMode={handleNormalMode}
            onFloatingMode={() => handleRestoreFromBubble('mini')}
            viewMode={viewMode}
          />
          <div className="chat-container-centered d-flex flex-column align-items-center flex-grow-1 overflow-hidden position-relative">
             {!isDrawerOpen && (
               <button 
                 className="sidebar-toggle-floating" 
                 onClick={() => setIsDrawerOpen(true)}
                 title="Open Sidebar"
               >
                 <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                   <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="9" y1="3" x2="9" y2="21"/>
                 </svg>
               </button>
             )}
             <div className="chat-content-wrapper w-100 max-w-3xl d-flex flex-column h-100">
                <ChatWindow messages={messages} isTyping={isTyping} newMsgId={newMsgId} isNormalMode={true} />
                <div className="normal-input-wrapper w-100 pb-4">
                  <InputBar onSend={handleSend} onStop={handleStop} disabled={isTyping} isNormalMode={true} />
                </div>
             </div>
          </div>
          
          <SettingsDrawer
            isOpen={isSettingsOpen}
            onClose={() => setIsSettingsOpen(false)}
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
            background: 'linear-gradient(90deg, transparent, rgba(99,102,241,0.6), transparent)',
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
        />
      </div>
    </div>
  );
}
