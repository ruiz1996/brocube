import { getOrbiterPosition } from '../balls/Orbiter.js';
import { circlePolygon } from './BallPhysicsSystem.js';

export class OrbiterDamageSystem {
  constructor(scene) { this.scene = scene; }

  update() {
    const bricks = this.scene.world.all('brick');
    for (const ball of this.scene.world.all('ball')) {
      if (!ball.active || ball.orbiters.length === 0) continue;
      for (const orbiter of ball.orbiters) {
        const position = getOrbiterPosition(ball, orbiter);
        const overlappingBrickIds = new Set();
        for (const brick of bricks) {
          if (!brick.active) continue;
          const collision = circlePolygon(position, brick);
          if (!collision) continue;
          overlappingBrickIds.add(brick.id);
          if (orbiter.brickContacts.has(brick.id)) continue;
          orbiter.brickContacts.add(brick.id);
          this.scene.ballCombat.applyDamage({
            ball,
            brick,
            damage: orbiter.damage,
            damageType: orbiter.damageType,
            contact: {
              normal: collision,
              orbiterId: orbiter.id,
              position,
            },
            cause: 'orbiting-satellite',
          });
          this.scene.events.emit('ball:orbiter-hit', {
            ball,
            orbiter,
            brick,
            position,
          });
        }
        for (const brickId of orbiter.brickContacts) {
          if (!overlappingBrickIds.has(brickId)) orbiter.brickContacts.delete(brickId);
        }
      }
    }
  }
}
