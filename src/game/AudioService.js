export class AudioService {
  constructor() { this.enabled = false; this.context = null; }
  setEnabled(value) { this.enabled = value; }
  play(frequency = 260, duration = .035, volume = .025) {
    if (!this.enabled) return;
    this.context ??= new AudioContext();
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(volume, this.context.currentTime);
    gain.gain.exponentialRampToValueAtTime(.0001, this.context.currentTime + duration);
    oscillator.connect(gain).connect(this.context.destination);
    oscillator.start(); oscillator.stop(this.context.currentTime + duration);
  }
}
