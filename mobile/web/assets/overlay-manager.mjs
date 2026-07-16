const stack = [];

function syncBodyLock() {
  globalThis.document?.body?.classList.toggle("local-overlay-open", stack.length > 0);
}

function findRecord(id) {
  return stack.findIndex((entry) => entry.id === id);
}

export const overlayManager = {
  openOverlay({ id, element = null, restoreFocus = null, onClose = null, removeElement = true } = {}) {
    if (!id) throw new Error("Overlay id is required");
    const existing = findRecord(id);
    if (existing >= 0) this.closeOverlay(id);
    stack.push({ id, element, restoreFocus, onClose, removeElement });
    syncBodyLock();
    return id;
  },

  closeTopOverlay() {
    const top = stack[stack.length - 1];
    return top ? this.closeOverlay(top.id) : false;
  },

  closeOverlay(id) {
    const index = findRecord(id);
    if (index < 0) return false;
    const [entry] = stack.splice(index, 1);
    try { entry.onClose?.(); } finally {
      if (entry.removeElement !== false) entry.element?.remove?.();
      syncBodyLock();
      entry.restoreFocus?.focus?.({ preventScroll: true });
    }
    return true;
  },

  hasOpenOverlay() {
    return stack.length > 0;
  },

  getTopOverlay() {
    return stack[stack.length - 1] || null;
  },

  get size() {
    return stack.length;
  },

  clear() {
    while (stack.length) this.closeTopOverlay();
  },
};

export function resetOverlayManagerForTests() {
  overlayManager.clear();
}
