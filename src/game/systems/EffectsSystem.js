import { Particle } from '../entities/entities.js';

export class EffectsSystem {
  constructor(scene) {
    this.scene = scene;
    this.shake = 0;
    this.unsubscribers = [
      scene.events.on('brick:destroyed', ({ brick }) => this.burst(brick.x + brick.width / 2, brick.y + brick.height / 2, brick.color, 11)),
      scene.events.on('ball:bounce', ({ ball, surface }) => {
        if (surface === 'paddle') this.burst(ball.x, ball.y + ball.radius, '#55e8ff', 5);
      }),
    ];
  }

  burst(x, y, color, count) {
    for (let i = 0; i < count; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 45 + Math.random() * 150;
      this.scene.world.add(new Particle({
        x, y, color,
        velocityX: Math.cos(angle) * speed,
        velocityY: Math.sin(angle) * speed,
        life: .25 + Math.random() * .35,
        size: 1.5 + Math.random() * 3,
      }));
    }
  }

  update(dt) {
    for (const particle of this.scene.world.all('particle')) {
      particle.x += particle.velocityX * dt;
      particle.y += particle.velocityY * dt;
      particle.velocityX *= .985;
      particle.velocityY = particle.velocityY * .985 + 90 * dt;
      particle.life -= dt;
      if (particle.life <= 0) particle.destroy();
    }
  }

  dispose() { this.unsubscribers.forEach((unsubscribe) => unsubscribe()); }
}
