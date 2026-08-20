export class EventBus {
  #listeners = new Map();

  on(eventName, handler, options = {}) {
    const listeners = this.#listeners.get(eventName) ?? new Set();
    const listener = { handler, once: Boolean(options.once) };
    listeners.add(listener);
    this.#listeners.set(eventName, listeners);
    return () => listeners.delete(listener);
  }

  once(eventName, handler) {
    return this.on(eventName, handler, { once: true });
  }

  emit(eventName, payload) {
    const listeners = this.#listeners.get(eventName);
    if (!listeners) return;
    for (const listener of [...listeners]) {
      listener.handler(payload);
      if (listener.once) listeners.delete(listener);
    }
  }

  clear(eventName) {
    if (eventName) this.#listeners.delete(eventName);
    else this.#listeners.clear();
  }
}
