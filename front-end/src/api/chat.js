/**
 * src/api/chat.js
 * All API calls to the FastAPI backend
 */

const BASE_URL = 'http://localhost:8000';

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
  const wsUrl = `ws://localhost:8000/ws/${sessionId}`;
  const ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    ws.send(JSON.stringify({ message, attachment }));
  };

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.type === 'token') {
      onToken(data.content);
    } else if (data.type === 'tool_start') {
      onToolStart?.(data.command);
    } else if (data.type === 'tool_output') {
      onToolOutput?.(data.result);
    } else if (data.type === 'done') {
      ws.close();
      onDone?.();
    } else if (data.type === 'error') {
      onError?.(new Error(data.content));
      ws.close();
    }
  };

  ws.onerror = (err) => {
    onError?.(err);
  };

  return { close: () => ws.close() };
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
 * Clear chat history for a session.
 */
export async function clearHistory(sessionId) {
  const res = await fetch(`${BASE_URL}/history/${sessionId}`, {
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
