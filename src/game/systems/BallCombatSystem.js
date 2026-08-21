import { GAME } from '../config.js';
import { BALL_TRAITS } from '../balls/BallTraits.js';

export class BallCombatSystem {
  constructor(scene) { this.scene = scene; }

  canHit(ball, brick) { return !ball.brickContacts.has(brick.id); }

  resolveBrickCollision({ ball, brick, normal }) {
    if (!ball.active || !brick.active || !this.canHit(ball, brick)) return null;
    ball.brickContacts.add(brick.id);
    const contact = { normal };
    const dealsContactDamage = ball.contactDamage !== false && ball.damage > 0;
    const damageResult = dealsContactDamage
      ? this.applyDamage({ ball, brick, damage: ball.damage, contact })
      : { damage: 0, destroyed: false };
    if (ball.damageEffects.length > 0) {
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
    }
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
    if (collisionResult.action === 'bounce') {
      this.scene.events.emit('ball:bounce', { ball, brick, surface: 'brick' });
    }
    return { ...damageResult, ...collisionResult };
  }

  applyDamage({
    ball,
    brick,
    damage = GAME.combat.baseDamage,
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
    if (destroyed) this.#recordBallKill(ball, brick, cause);
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

  #recordBallKill(ball, brick, cause) {
    if (!ball || ball.type !== 'ball') return;
    ball.kills = Math.max(0, Math.round(ball.kills ?? 0)) + 1;
    const thresholds = GAME.ball.levelKillThresholds;
    const maximumLevel = thresholds.length + 1;
    while (
      ball.level < maximumLevel
      && ball.kills >= thresholds[ball.level - 1]
    ) {
      const previousLevel = ball.level;
      ball.level += 1;
      ball.levelUpAt = ball.age ?? 0;
      if (ball.contactDamage !== false) ball.damage += GAME.ball.levelDamageBonus;
      const livesBonus = ball.level === GAME.ball.levelLivesBonusLevel
        ? GAME.ball.levelLivesBonus
        : 0;
      ball.lives += livesBonus;
      const skillBonuses = this.#applySkillLevelBonus(ball);
      this.scene.events.emit('ball:leveled', {
        ball,
        brick,
        cause,
        previousLevel,
        level: ball.level,
        kills: ball.kills,
        damageBonus: ball.contactDamage === false ? 0 : GAME.ball.levelDamageBonus,
        livesBonus,
        skillBonuses,
      });
    }
  }

  #applySkillLevelBonus(ball) {
    const skillBonuses = {};
    const blastEffect = ball.periodicEffects.find(({ id }) => id === 'area-blast');
    if (blastEffect) {
      blastEffect.config.damage = (blastEffect.config.damage ?? GAME.upgrade.blastDamage)
        + GAME.ball.levelBlastDamageBonus;
      blastEffect.config.radius = (blastEffect.config.radius ?? GAME.upgrade.blastRadius)
        + GAME.ball.levelBlastRadiusBonus;
      skillBonuses.blast = {
        damage: blastEffect.config.damage,
        radius: blastEffect.config.radius,
      };
      const impactEffect = ball.damageEffects.find(({ id }) => id === 'impact-blast');
      if (impactEffect) {
        impactEffect.config.damage = blastEffect.config.damage;
        impactEffect.config.radius = blastEffect.config.radius;
      }
    }

    const lightningEffect = ball.damageEffects.find(({ id }) => id === 'chain-lightning');
    if (lightningEffect) {
      lightningEffect.config.damage = (lightningEffect.config.damage ?? GAME.upgrade.lightningDamage)
        + GAME.ball.levelLightningDamageBonus;
      lightningEffect.config.additionalTargets = (
        lightningEffect.config.additionalTargets ?? GAME.upgrade.lightningAdditionalTargets
      ) + GAME.ball.levelLightningTargetBonus;
      skillBonuses.lightning = {
        damage: lightningEffect.config.damage,
        additionalTargets: lightningEffect.config.additionalTargets,
      };
    }

    if (ball.hasTrait(BALL_TRAITS.VOID_ORBIT) && ball.orbiters.length > 0) {
      for (let count = 0; count < GAME.ball.levelVoidOrbiterBonus; count += 1) {
        const template = ball.orbiters[0];
        ball.orbiters.push({
          ...template,
          id: `orbiter-level-${ball.level}-${ball.orbiters.length}`,
          visual: { ...template.visual },
          brickContacts: new Set(),
        });
      }
      const phaseOffset = ball.orbiters[0].phase;
      for (let index = 0; index < ball.orbiters.length; index += 1) {
        ball.orbiters[index].phase = phaseOffset + index * Math.PI * 2 / ball.orbiters.length;
      }
      skillBonuses.voidOrbit = { orbiterCount: ball.orbiters.length };
    }
    return skillBonuses;
  }
}
