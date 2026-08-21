import { BlastWave, LightningArc, LightningStrike, Particle } from '../entities/entities.js';
import { BALL_TRAITS } from '../balls/BallTraits.js';

export class EffectsSystem {
  constructor(scene) {
    this.scene = scene;
    this.shake = 0;
    this.unsubscribers = [
      scene.events.on('brick:destroyed', ({ brick }) => this.burst(brick.x + brick.width / 2, brick.y + brick.height / 2, brick.color, 11)),
      scene.events.on('ball:bounce', ({ ball, surface }) => {
        if (surface === 'paddle') this.burst(ball.x, ball.y + ball.radius, '#55e8ff', 5);
      }),
      scene.events.on('ball:launched', ({ ball }) => {
        if (!ball.hasTrait(BALL_TRAITS.TOP_LAUNCH)) return;
        this.burst(ball.x, ball.y, '#ffad5a', 13);
        this.burst(ball.x, ball.y, '#ff5c7d', 7);
      }),
      scene.events.on('ball:exploded', ({ x, y, radius, color, secondaryColor }) => {
        this.scene.world.add(new BlastWave({ x, y, radius, color, secondaryColor }));
        this.burst(x, y, color, 18);
        this.burst(x, y, secondaryColor, 8);
      }),
      scene.events.on('ball:lightning-chain', ({ points }) => {
        this.scene.world.add(new LightningArc({ points }));
      }),
      scene.events.on('ball:lightning-strike', ({ x, y }) => {
        this.scene.world.add(new LightningStrike({ x, y }));
        this.burst(x, y, '#baf5ff', 9);
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
    for (const wave of this.scene.world.all('blast-wave')) {
      wave.life -= dt;
      if (wave.life <= 0) wave.destroy();
    }
    for (const arc of this.scene.world.all('lightning-arc')) {
      arc.life -= dt;
      if (arc.life <= 0) arc.destroy();
    }
    for (const strike of this.scene.world.all('lightning-strike')) {
      strike.life -= dt;
      if (strike.life <= 0) strike.destroy();
    }
  }

  dispose() { this.unsubscribers.forEach((unsubscribe) => unsubscribe()); }
}
