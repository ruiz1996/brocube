import { GAME } from '../config.js';

export class BallEmitterRegistry {
  constructor() { this.emitters = new Map(); }

  register(id, emitter) {
    if (!id || this.emitters.has(id)) throw new Error(`Ball emitter already exists: ${id}`);
    this.emitters.set(id, emitter);
    return this;
  }

  createShot(id, context) {
    const emitter = this.emitters.get(id);
    if (!emitter) throw new Error(`Unknown ball emitter: ${id}`);
    return emitter(context);
  }

  has(id) { return this.emitters.has(id); }
}

export function createDefaultBallEmitters() {
  const registry = new BallEmitterRegistry();

  registry.register('paddle', ({ scene, random, randomized = false, radius = GAME.ball.radius }) => {
    const paddle = scene.world.first('paddle');
    if (!paddle) return null;
    const minimum = GAME.upgrade.randomLaunchMinAngle;
    const angle = randomized
      ? -(minimum + random() * (Math.PI - minimum * 2))
      : -Math.PI / 2 + (random() - .5) * .26;
    return {
      x: paddle.x + paddle.width / 2,
      y: paddle.y - radius - 4,
      angle,
    };
  });

  registry.register('top', ({ random, radius = GAME.ball.radius }) => {
    const margin = radius + 18;
    const minimum = GAME.upgrade.randomLaunchMinAngle;
    return {
      x: margin + random() * (GAME.width - margin * 2),
      y: GAME.playTop + radius + 3,
      angle: minimum + random() * (Math.PI - minimum * 2),
    };
  });

  return registry;
}
