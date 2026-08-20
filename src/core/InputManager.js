export class InputManager {
  constructor(element) {
    this.element = element;
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
      const bounds = this.element.getBoundingClientRect();
      this.pointer.x = (event.clientX - bounds.left) * (this.element.width / bounds.width);
      this.pointer.y = (event.clientY - bounds.top) * (this.element.height / bounds.height);
      this.pointer.active = true;
    };
    this.element.addEventListener('pointermove', updatePointer);
    this.element.addEventListener('pointerdown', (event) => {
      updatePointer(event);
      this.pointer.justPressed = true;
    });
    this.element.addEventListener('pointerleave', () => { this.pointer.active = false; });
  }

  isDown(...codes) { return codes.some((code) => this.keys.has(code)); }
  pressed(...codes) { return codes.some((code) => this.justPressed.has(code)); }
  endFrame() { this.justPressed.clear(); this.pointer.justPressed = false; }
}
