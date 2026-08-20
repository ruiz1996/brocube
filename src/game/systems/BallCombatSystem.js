export class BallCombatSystem {
  constructor(scene) { this.scene = scene; }

  canHit(ball, brick) { return !ball.brickContacts.has(brick.id); }

  resolveBrickCollision({ ball, brick, normal }) {
    if (!ball.active || !brick.active || !this.canHit(ball, brick)) return null;
    ball.brickContacts.add(brick.id);
    const contact = { normal };
    const damageResult = this.applyDamage({ ball, brick, damage: ball.damage, contact });
    this.scene.ballBehaviors.runDamageEffects(ball.damageEffects, {
      scene: this.scene,
      world: this.scene.world,
      events: this.scene.events,
      combat: this,
      ball,
      brick,
      contact,
      ...damageResult,
    });
    const collisionResult = this.scene.ballBehaviors.resolveCollision(ball.collisionPolicy, {
      scene: this.scene,
      world: this.scene.world,
      events: this.scene.events,
      combat: this,
      ball,
      brick,
      contact,
      ...damageResult,
    });
    return { ...damageResult, ...collisionResult };
  }

  applyDamage({
    ball,
    brick,
    damage = 1,
    damageType = ball?.damageType ?? 'kinetic',
    contact = null,
    cause = 'ball',
    triggerEffects = false,
  }) {
    if (!brick.active) return { damage: 0, destroyed: false };
    const appliedDamage = Math.max(0, damage);
    const destroyed = brick.damage(appliedDamage);
    const payload = { brick, ball, damage: appliedDamage, damageType, destroyed, contact, cause };
    this.scene.events.emit('brick:hit', payload);
    this.scene.events.emit(destroyed ? 'brick:destroyed' : 'brick:damaged', payload);
    if (triggerEffects && ball?.damageEffects?.length) {
      this.scene.ballBehaviors.runDamageEffects(ball.damageEffects, {
        scene: this.scene,
        world: this.scene.world,
        events: this.scene.events,
        combat: this,
        ...payload,
      });
    }
    return { damage: appliedDamage, destroyed };
  }
}
