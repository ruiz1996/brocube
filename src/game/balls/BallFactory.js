import { Ball } from '../entities/entities.js';
import { GAME } from '../config.js';
import { BASIC_BALL_ID } from './BallDefinitionRegistry.js';

export class BallFactory {
  constructor(definitions) { this.definitions = definitions; }

  createPrimary({
    definitionId = BASIC_BALL_ID,
    x,
    y,
    angle,
    speed = GAME.ball.speed,
    speedMultiplier = 1,
    visualOverrides = {},
  }) {
    const definition = this.definitions.get(definitionId);
    return this.#create({
      definition,
      definitionId,
      role: 'primary',
      x,
      y,
      angle,
      speed: speed * speedMultiplier * definition.speedMultiplier,
      visualOverrides,
    });
  }

  createDerived({ x, y, angle, speed = GAME.ball.speed }) {
    const basic = this.definitions.get(BASIC_BALL_ID);
    return new Ball({
      definitionId: BASIC_BALL_ID,
      role: 'derived',
      x,
      y,
      angle,
      speed,
      radius: GAME.ball.derivedRadius,
      damage: 1,
      damageType: 'kinetic',
      damageEffects: [],
      collisionPolicy: 'bounce',
      collisionConfig: {},
      visual: { ...basic.visual, trailLength: Math.min(5, basic.visual.trailLength) },
    });
  }

  #create({ definition, definitionId, role, x, y, angle, speed, visualOverrides = {} }) {
    return new Ball({
      definitionId,
      role,
      x,
      y,
      angle,
      speed,
      radius: definition.radius,
      damage: definition.damage,
      damageType: definition.damageType,
      damageEffects: definition.damageEffects.map((effect) => ({
        id: effect.id,
        config: { ...effect.config },
      })),
      collisionPolicy: definition.collisionPolicy,
      collisionConfig: { ...definition.collisionConfig },
      visual: { ...definition.visual, ...visualOverrides },
    });
  }
}
