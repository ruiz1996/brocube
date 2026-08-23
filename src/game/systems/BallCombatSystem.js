import { GAME } from '../config.js';
import { BALL_TRAITS } from '../balls/BallTraits.js';
import { addBallBaseDamage, normalizeDamage } from '../Damage.js';

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
    const appliedDamage = normalizeDamage(damage);
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
      if (ball.contactDamage !== false) addBallBaseDamage(ball, GAME.ball.levelDamageBonus);
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

    for (const orbiter of ball.orbiters) {
      const payload = orbiter.payload;
      const payloadBlast = payload?.periodicEffects?.find(({ id }) => id === 'area-blast');
      if (payloadBlast) {
        payloadBlast.config.damage = normalizeDamage(
          (payloadBlast.config.damage ?? GAME.upgrade.blastDamage)
            + GAME.ball.levelBlastDamageBonus,
        );
        payloadBlast.config.radius = (payloadBlast.config.radius ?? GAME.upgrade.blastRadius)
          + GAME.ball.levelBlastRadiusBonus;
        const impact = payload.damageEffects.find(({ id }) => id === 'impact-blast');
        if (impact) {
          impact.config.damage = payloadBlast.config.damage;
          impact.config.radius = payloadBlast.config.radius;
        }
        skillBonuses.blast = {
          damage: payloadBlast.config.damage,
          radius: payloadBlast.config.radius,
        };
      }
      const payloadLightning = payload?.damageEffects?.find(({ id }) => id === 'chain-lightning');
      if (payloadLightning) {
        payloadLightning.config.damage = normalizeDamage(
          (payloadLightning.config.damage ?? GAME.upgrade.lightningDamage)
            + GAME.ball.levelLightningDamageBonus,
        );
        payloadLightning.config.additionalTargets = (
          payloadLightning.config.additionalTargets ?? GAME.upgrade.lightningAdditionalTargets
        ) + GAME.ball.levelLightningTargetBonus;
        skillBonuses.lightning = {
          damage: payloadLightning.config.damage,
          additionalTargets: payloadLightning.config.additionalTargets,
        };
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
          payload: template.payload ? {
            ...template.payload,
            traits: new Set(template.payload.traits ?? []),
            damageEffects: template.payload.damageEffects.map((effect) => ({
              id: effect.id,
              config: { ...effect.config },
            })),
            periodicEffects: template.payload.periodicEffects.map((effect) => ({
              id: effect.id,
              interval: effect.interval,
              timeRemaining: effect.timeRemaining,
              config: { ...effect.config },
            })),
            guidance: template.payload.guidance ? {
              ...template.payload.guidance,
              lunge: null,
            } : null,
          } : null,
          positionOverride: null,
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
