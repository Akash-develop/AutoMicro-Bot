export function isTauri() {
  if (typeof window === 'undefined') return false;
  // Tauri v2 can expose different globals depending on build/runtime.
  return Boolean(
    window.__TAURI__ ||
    window.__TAURI_INTERNALS__ ||
    window.__TAURI_IPC__ ||
    window.__TAURI_METADATA__
  );
}

