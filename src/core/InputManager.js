const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));

export function mapPointerToElement(event, element) {
  const bounds = element.getBoundingClientRect();
  const width = element.width ?? bounds.width;
  const height = element.height ?? bounds.height;
  return {
    x: clamp((event.clientX - bounds.left) * (width / Math.max(1, bounds.width)), 0, width),
    y: clamp((event.clientY - bounds.top) * (height / Math.max(1, bounds.height)), 0, height),
  };
}

export class InputManager {
  constructor(options) {
    const coordinateElement = options?.coordinateElement ?? options;
    const pointerTargets = options?.coordinateElement
      ? options.pointerTargets ?? [coordinateElement]
      : [coordinateElement];
    this.element = coordinateElement;
    this.pointerTargets = [...new Set(pointerTargets.filter(Boolean))];
    this.keys = new Set();
    this.justPressed = new Set();
    this.pointer = { x: 0, y: 0, active: false, justPressed: false };
    this.#bind();
  }

  #bind() {
    window.addEventListener('keydown', (event) => {
      if (!this.keys.has(event.code)) this.justPressed.add(event.code);
      this.keys.add(event.code);
      if (['ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) event.preventDefault();
    });
    window.addEventListener('keyup', (event) => this.keys.delete(event.code));
    window.addEventListener('blur', () => this.keys.clear());

    const updatePointer = (event) => {
      const position = mapPointerToElement(event, this.element);
      this.pointer.x = position.x;
      this.pointer.y = position.y;
      this.pointer.active = true;
    };
    for (const target of this.pointerTargets) {
      const acceptsPointer = (event) => target === this.element || event.pointerType !== 'mouse';
      target.addEventListener('pointermove', (event) => {
        if (!acceptsPointer(event)) return;
        if (event.pointerType !== 'mouse') event.preventDefault();
        updatePointer(event);
      }, { passive: false });
      target.addEventListener('pointerdown', (event) => {
        if (!acceptsPointer(event)) return;
        if (event.pointerType !== 'mouse') event.preventDefault();
        updatePointer(event);
        this.pointer.justPressed = true;
        target.setPointerCapture?.(event.pointerId);
      }, { passive: false });
      target.addEventListener('pointerup', () => { this.pointer.active = false; });
      target.addEventListener('pointercancel', () => { this.pointer.active = false; });
      target.addEventListener('pointerleave', (event) => {
        if (event.pointerType === 'mouse') this.pointer.active = false;
      });
    }
  }

  isDown(...codes) { return codes.some((code) => this.keys.has(code)); }
  pressed(...codes) { return codes.some((code) => this.justPressed.has(code)); }
  endFrame() { this.justPressed.clear(); this.pointer.justPressed = false; }
}
