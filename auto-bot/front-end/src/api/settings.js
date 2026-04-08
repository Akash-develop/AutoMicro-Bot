/**
 * src/api/settings.js
 * API calls for managing tool permissions.
 */

const BACKEND_PORT_TAURI_PROD = '8765';
import { isTauri } from '../utils/platform.js';
const BASE_URL = isTauri() ? `http://127.0.0.1:${BACKEND_PORT_TAURI_PROD}` : 'http://localhost:8000';

export async function getPermissions() {
  const res = await fetch(`${BASE_URL}/settings/permissions`);
  if (!res.ok) throw new Error(`Failed to load permissions: ${res.status}`);
  return res.json();
}

export async function updatePermissions(permissions, locked_tools = []) {
  const res = await fetch(`${BASE_URL}/settings/permissions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ permissions, locked_tools }),
  });
  if (!res.ok) throw new Error(`Failed to update permissions: ${res.status}`);
  return res.json();
}

export async function deletePermission(toolName) {
  const res = await fetch(`${BASE_URL}/settings/permissions/${toolName}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error(`Failed to delete permission: ${res.status}`);
  return res.json();
}

export async function getLLMSettings() {
  const res = await fetch(`${BASE_URL}/settings/llm`);
  if (!res.ok) throw new Error(`Failed to load LLM settings: ${res.status}`);
  return res.json();
}

export async function updateLLMSettings(settings) {
  const res = await fetch(`${BASE_URL}/settings/llm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  });
  if (!res.ok) throw new Error(`Failed to update LLM settings: ${res.status}`);
  return res.json();
}

export async function getLLMHistory() {
  const res = await fetch(`${BASE_URL}/settings/llm/history`);
  if (!res.ok) throw new Error(`Failed to load LLM history: ${res.status}`);
  return res.json();
}

export async function activateLLMConfig(historyId) {
  const res = await fetch(`${BASE_URL}/settings/llm/history/${historyId}/activate`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error(`Failed to activate LLM config: ${res.status}`);
  return res.json();
}

export async function deleteLLMHistory(historyId) {
  console.log(`API CALL: DELETE ${BASE_URL}/settings/llm/history/${historyId}`);
  const res = await fetch(`${BASE_URL}/settings/llm/history/${historyId}`, {
    method: 'DELETE',
  });
  console.log(`API RESPONSE STATUS: ${res.status}`);
  if (!res.ok) throw new Error(`Failed to delete LLM history: ${res.status}`);
  return res.json();
}

export async function getAvailableModels(provider, baseUrl, apiKey = "") {
  const res = await fetch(`${BASE_URL}/settings/llm/models?provider=${provider}&base_url=${encodeURIComponent(baseUrl)}&api_key=${encodeURIComponent(apiKey)}`);
  if (!res.ok) throw new Error(`Failed to fetch models: ${res.status}`);
  return res.json();
}

// ─── Humanoid Personality Settings ───────────────────────────────

export async function getPersonality() {
  const res = await fetch(`${BASE_URL}/settings/personality`);
  if (!res.ok) throw new Error(`Failed to load personality: ${res.status}`);
  return res.json();
}

export async function updatePersonality(config) {
  const res = await fetch(`${BASE_URL}/settings/personality`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
  if (!res.ok) throw new Error(`Failed to update personality: ${res.status}`);
  return res.json();
}

export async function resetPersonality() {
  const res = await fetch(`${BASE_URL}/settings/personality/reset`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error(`Failed to reset personality: ${res.status}`);
  return res.json();
}

export async function getPersonalityPresets() {
  const res = await fetch(`${BASE_URL}/settings/personality/presets`);
  if (!res.ok) throw new Error(`Failed to load presets: ${res.status}`);
  return res.json();
}

// ─── Knowledge Base ─────────────────────────────────────────────

export async function getKnowledgeStats() {
  const res = await fetch(`${BASE_URL}/knowledge/stats`);
  if (!res.ok) throw new Error(`Failed to load knowledge stats: ${res.status}`);
  return res.json();
}

export async function getKnowledgeSources() {
  const res = await fetch(`${BASE_URL}/knowledge/sources`);
  if (!res.ok) throw new Error(`Failed to load sources: ${res.status}`);
  return res.json();
}

export async function ingestAllPDFs() {
  const res = await fetch(`${BASE_URL}/knowledge/ingest-all`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error(`Failed to ingest PDFs: ${res.status}`);
  return res.json();
}
