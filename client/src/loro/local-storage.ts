const SNAPSHOT_KEY_PREFIX = 'compact-chatment-snapshot-';

/**
 * Save a Loro snapshot to LocalStorage as Base64.
 */
export function saveSnapshot(docId: string, binaryData: Uint8Array): void {
  try {
    const base64 = uint8ArrayToBase64(binaryData);
    localStorage.setItem(SNAPSHOT_KEY_PREFIX + docId, base64);
  } catch (err) {
    console.warn('[LocalStorage] Failed to save snapshot:', err);
  }
}

/**
 * Load a Loro snapshot from LocalStorage.
 */
export function loadSnapshot(docId: string): Uint8Array | null {
  try {
    const base64 = localStorage.getItem(SNAPSHOT_KEY_PREFIX + docId);
    if (!base64) return null;
    return base64ToUint8Array(base64);
  } catch (err) {
    console.warn('[LocalStorage] Failed to load snapshot:', err);
    return null;
  }
}

/**
 * Save the split-view ratio to LocalStorage.
 */
export function saveSplitRatio(ratio: number): void {
  localStorage.setItem('compact-chatment-split-ratio', String(ratio));
}

/**
 * Load the split-view ratio from LocalStorage.
 */
export function loadSplitRatio(): number | null {
  const val = localStorage.getItem('compact-chatment-split-ratio');
  if (val === null) return null;
  const num = parseFloat(val);
  return isNaN(num) ? null : num;
}

/**
 * Save user info to LocalStorage.
 */
export function saveUserName(name: string): void {
  localStorage.setItem('compact-chatment-username', name);
}
export function loadUserName(): string | null {
  return localStorage.getItem('compact-chatment-username');
}

export function saveUserColorIndex(userName: string, index: number): void {
  localStorage.setItem(`chatment-color-index-${userName}`, String(index));
}

export function loadUserColorIndex(userName: string): number | null {
  const val = localStorage.getItem(`chatment-color-index-${userName}`);
  if (val === null) return null;
  const num = parseInt(val, 10);
  return isNaN(num) ? null : num;
}
/**
 * Create a debounced auto-save function.
 */
export function createAutoSave(docId: string, delayMs = 500) {
  let timer: ReturnType<typeof setTimeout> | null = null;

  return (binaryData: Uint8Array) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      saveSnapshot(docId, binaryData);
    }, delayMs);
  };
}

// ─── Helpers ────────────────────────────────────────────

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
