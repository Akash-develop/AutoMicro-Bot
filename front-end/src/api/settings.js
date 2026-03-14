/**
 * src/api/settings.js
 * API calls for managing tool permissions.
 */

const BASE_URL = 'http://localhost:8000';

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

export async function getMemories() {
  const res = await fetch(`${BASE_URL}/settings/memory`);
  if (!res.ok) throw new Error(`Failed to load memories: ${res.status}`);
  return res.json();
}

export async function deleteMemory(id) {
  const res = await fetch(`${BASE_URL}/settings/memory/${id}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error(`Failed to delete memory: ${res.status}`);
  return res.json();
}

export async function clearMemories() {
  const res = await fetch(`${BASE_URL}/settings/memory`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error(`Failed to clear memories: ${res.status}`);
  return res.json();
}
