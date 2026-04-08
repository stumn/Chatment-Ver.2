import { LoroDoc, UndoManager } from 'loro-crdt';

let undoManagerInstance: UndoManager | null = null;

/**
 * Initialize the UndoManager for the given LoroDoc.
 * Excludes remote sync operations from the undo stack.
 */
export function initUndoManager(doc: LoroDoc): UndoManager {
  if (undoManagerInstance) {
    return undoManagerInstance;
  }

  undoManagerInstance = new UndoManager(doc, {
    mergeInterval: 1000,
    maxUndoSteps: 100,
    excludeOriginPrefixes: ['sync-'],
  });

  return undoManagerInstance;
}

/**
 * Get the current UndoManager instance.
 */
export function getUndoManager(): UndoManager | null {
  return undoManagerInstance;
}

/**
 * Perform undo.
 */
export function undo(): boolean {
  if (!undoManagerInstance) return false;
  return undoManagerInstance.undo();
}

/**
 * Perform redo.
 */
export function redo(): boolean {
  if (!undoManagerInstance) return false;
  return undoManagerInstance.redo();
}

/**
 * Set up global keyboard shortcuts for undo/redo.
 * Returns a cleanup function.
 */
export function setupUndoKeyBindings(): () => void {
  const handler = (e: KeyboardEvent) => {
    const isCtrlOrMeta = e.ctrlKey || e.metaKey;
    if (!isCtrlOrMeta) return;

    if (e.key === 'z' && !e.shiftKey) {
      e.preventDefault();
      undo();
    } else if (e.key === 'y' || (e.key === 'z' && e.shiftKey)) {
      e.preventDefault();
      redo();
    }
  };

  window.addEventListener('keydown', handler);
  return () => window.removeEventListener('keydown', handler);
}

/**
 * Destroy the UndoManager instance.
 */
export function destroyUndoManager(): void {
  undoManagerInstance = null;
}
