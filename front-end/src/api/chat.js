/**
 * src/api/chat.js
 * All API calls to the FastAPI backend
 */

const BACKEND_PORT_TAURI_PROD = '8765';
const isTauri = typeof window !== 'undefined' && !!window.__TAURI__;
const BASE_URL = isTauri ? `http://127.0.0.1:${BACKEND_PORT_TAURI_PROD}` : 'http://localhost:8000';

/**
 * Send a message to the backend.
 */
export async function sendMessage(sessionId, message) {
  const res = await fetch(`${BASE_URL}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId, message }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Server error: ${res.status}`);
  }
  return res.json();
}

/**
 * Stream a response token by token via WebSocket, supporting tool events.
 */
export function streamMessage(sessionId, message, onToken, onToolStart, onToolOutput, onDone, onError, attachment = null) {
  const controller = new AbortController();
  let closed = false;

  const close = () => {
    if (closed) return;
    closed = true;
    controller.abort();
  };

  const parseEventBlock = (block) => {
    // Expected:
    // event: token|tool_start|tool_output|done|error
    // data: {...}
    const lines = block.split('\n').filter((l) => l.trim() !== '');
    let eventName = null;
    const dataLines = [];
    for (const line of lines) {
      if (line.startsWith('event:')) {
        eventName = line.slice('event:'.length).trim();
      } else if (line.startsWith('data:')) {
        dataLines.push(line.slice('data:'.length).trim());
      }
    }
    if (!eventName) return;
    const dataStr = dataLines.join('\n') || '{}';
    let data = {};
    try {
      data = JSON.parse(dataStr);
    } catch {
      data = { content: dataStr };
    }

    if (eventName === 'token') {
      onToken?.(data.content ?? '');
    } else if (eventName === 'tool_start') {
      onToolStart?.(data.command);
    } else if (eventName === 'tool_output') {
      onToolOutput?.(data.result);
    } else if (eventName === 'done') {
      onDone?.();
      close();
    } else if (eventName === 'error') {
      onError?.(new Error(data.content || 'Streaming error'));
      close();
    }
  };

  (async () => {
    try {
      const res = await fetch(`${BASE_URL}/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, message, attachment }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Server error: ${res.status}`);
      }

      if (!res.body) {
        throw new Error('Streaming not supported in this environment');
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // SSE events are separated by a blank line
        let idx;
        while ((idx = buffer.indexOf('\n\n')) !== -1) {
          const block = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          if (block.trim()) parseEventBlock(block);
        }
      }
    } catch (err) {
      if (err?.name === 'AbortError') return; // user pressed Stop
      onError?.(err);
    } finally {
      close();
    }
  })();

  return { close };
}

/**
 * Fetch chat history for a session.
 */
export async function getHistory(sessionId) {
  const res = await fetch(`${BASE_URL}/history/${sessionId}`);
  if (!res.ok) throw new Error(`Failed to load history: ${res.status}`);
  return res.json();
}

/**
 * Clear ONLY the messages for a session (keeps the conversation record).
 * Bug #5 fix: previously called DELETE /history/{id} which wiped the entire
 * conversation. Now calls the correct /history/{id}/messages endpoint.
 */
export async function clearHistory(sessionId) {
  const res = await fetch(`${BASE_URL}/history/${sessionId}/messages`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error(`Failed to clear history: ${res.status}`);
  return res.json();
}

/**
 * List all conversations (with titles, grouped by date).
 */
export async function listSessions() {
  const res = await fetch(`${BASE_URL}/history`);
  if (!res.ok) throw new Error(`Failed to list sessions: ${res.status}`);
  return res.json();
}

/**
 * Rename a conversation.
 */
export async function renameConversation(sessionId, title) {
  const res = await fetch(`${BASE_URL}/conversations/${sessionId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  });
  if (!res.ok) throw new Error(`Failed to rename conversation: ${res.status}`);
  return res.json();
}

/**
 * Delete a conversation and all its messages.
 */
export async function deleteConversation(sessionId) {
  const res = await fetch(`${BASE_URL}/history/${sessionId}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error(`Failed to delete conversation: ${res.status}`);
  return res.json();
}
/**
 * Quickly open a local terminal window via the backend.
 */
export async function openTerminal() {
  const res = await fetch(`${BASE_URL}/terminal/open`, { method: 'POST' });
  if (!res.ok) throw new Error(`Failed to open terminal: ${res.status}`);
  return res.json();
}
