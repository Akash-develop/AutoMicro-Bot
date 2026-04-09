/**
 * Backend base URL for API calls.
 *
 * - Browser (Vite dev): localhost:8000 (matches `poetry run start` in back-end).
 * - Tauri dev: same as browser — sidecar is NOT spawned in debug builds, so 8765 has no server.
 * - Tauri production: bundled sidecar listens on 127.0.0.1:8765 (see src-tauri/src/lib.rs).
 *
 * Override with VITE_BACKEND_URL (e.g. http://127.0.0.1:8000).
 */
import { isTauri } from '../utils/platform.js';

const TAURI_PROD_PORT = '8765';

export function getBackendBaseUrl() {
  const fromEnv = import.meta.env.VITE_BACKEND_URL;
  if (fromEnv && String(fromEnv).trim()) {
    return String(fromEnv).replace(/\/$/, '');
  }

  if (!isTauri()) {
    return 'http://localhost:8000';
  }

  // Tauri + Vite dev: no sidecar; use same backend as web dev.
  if (import.meta.env.DEV) {
    return 'http://localhost:8000';
  }

  return `http://127.0.0.1:${TAURI_PROD_PORT}`;
}
