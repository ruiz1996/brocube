import { GAME } from '../config.js';
import { BALL_TRAITS } from '../balls/BallTraits.js';
import {
  addBallBaseDamage,
  normalizeDamage,
  resolveAbilityDamage,
  scaleDamage,
} from '../Damage.js';

export class BallCombatSystem {
  constructor(scene) { this.scene = scene; }

  canHit(ball, brick) { return !ball.brickContacts.has(brick.id); }

  resolveBrickCollision({ ball, brick, normal }) {
    if (!ball.active || !brick.active || !this.canHit(ball, brick)) return null;
    ball.brickContacts.add(brick.id);
    const contact = { normal };
    const hitDamageMultiplier = ball.collectibleNextHitDamageMultiplier ?? 1;
    const dealsContactDamage = ball.contactDamage !== false && ball.damage > 0;
    const damageResult = dealsContactDamage
      ? this.applyDamage({
        ball,
        brick,
        damage: scaleDamage(ball.damage, hitDamageMultiplier),
        contact,
      })
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
        hitDamageMultiplier,
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
    ball.collectibleNextHitDamageMultiplier = 1;
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
    const bonusProgress = this.scene.collectibleRun.rollBonusExperience() ? 1 : 0;
    const experienceGained = (1 + bonusProgress)
      * this.scene.collectibleRun.experienceMultiplier;
    ball.experience = Math.max(0, Number(ball.experience ?? ball.kills - 1))
      + experienceGained;
    const thresholds = GAME.ball.levelKillThresholds;
    const maximumLevel = thresholds.length + 1;
    while (
      ball.level < maximumLevel
      && ball.experience + Number.EPSILON >= thresholds[ball.level - 1]
    ) {
      const previousLevel = ball.level;
      ball.level += 1;
      ball.levelUpAt = ball.age ?? 0;
      const damageBonus = this.scene.collectibleRun.scaleBaseDamageGain(
        GAME.ball.levelDamageBonus,
        ball,
      );
      addBallBaseDamage(ball, damageBonus);
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
        damageBonus,
        livesBonus,
        skillBonuses,
      });
    }
    this.scene.events.emit('ball:experience', {
      ball,
      brick,
      cause,
      experience: ball.experience,
      experienceGained,
      bonusProgress,
      multiplier: this.scene.collectibleRun.experienceMultiplier,
    });
  }

  #applySkillLevelBonus(ball) {
    const skillBonuses = {};
    const blastEffect = ball.periodicEffects.find(({ id }) => id === 'area-blast');
    if (blastEffect) {
      blastEffect.config.flatDamageBonus = (blastEffect.config.flatDamageBonus ?? 0)
        + GAME.ball.levelBlastDamageBonus;
      blastEffect.config.radius = (blastEffect.config.radius ?? GAME.upgrade.blastRadius)
        + GAME.ball.levelBlastRadiusBonus;
      skillBonuses.blast = {
        damage: resolveAbilityDamage(ball, blastEffect.config, GAME.upgrade.blastDamage),
        radius: blastEffect.config.radius,
      };
      const impactEffect = ball.damageEffects.find(({ id }) => id === 'impact-blast');
      if (impactEffect) {
        impactEffect.config.baseDamageScale = blastEffect.config.baseDamageScale;
        impactEffect.config.flatDamageBonus = blastEffect.config.flatDamageBonus;
        impactEffect.config.radius = blastEffect.config.radius;
      }
    }

    for (const orbiter of ball.orbiters) {
      const payload = orbiter.payload;
      const payloadBlast = payload?.periodicEffects?.find(({ id }) => id === 'area-blast');
      if (payloadBlast) {
        payloadBlast.config.flatDamageBonus = normalizeDamage(
          (payloadBlast.config.flatDamageBonus ?? 0) + GAME.ball.levelBlastDamageBonus,
        );
        payloadBlast.config.radius = (payloadBlast.config.radius ?? GAME.upgrade.blastRadius)
          + GAME.ball.levelBlastRadiusBonus;
        const impact = payload.damageEffects.find(({ id }) => id === 'impact-blast');
        if (impact) {
          impact.config.baseDamageScale = payloadBlast.config.baseDamageScale;
          impact.config.flatDamageBonus = payloadBlast.config.flatDamageBonus;
          impact.config.radius = payloadBlast.config.radius;
        }
        skillBonuses.blast = {
          damage: resolveAbilityDamage(ball, payloadBlast.config, GAME.upgrade.blastDamage),
          radius: payloadBlast.config.radius,
        };
      }
      const payloadLightning = payload?.damageEffects?.find(({ id }) => id === 'chain-lightning');
      if (payloadLightning) {
        payloadLightning.config.flatDamageBonus = normalizeDamage(
          (payloadLightning.config.flatDamageBonus ?? 0) + GAME.ball.levelLightningDamageBonus,
        );
        payloadLightning.config.additionalTargets = (
          payloadLightning.config.additionalTargets ?? GAME.upgrade.lightningAdditionalTargets
        ) + GAME.ball.levelLightningTargetBonus;
        skillBonuses.lightning = {
          damage: resolveAbilityDamage(ball, payloadLightning.config, GAME.upgrade.lightningDamage),
          additionalTargets: payloadLightning.config.additionalTargets,
        };
      }
    }

    const lightningEffect = ball.damageEffects.find(({ id }) => id === 'chain-lightning');
    if (lightningEffect) {
      lightningEffect.config.flatDamageBonus = (lightningEffect.config.flatDamageBonus ?? 0)
        + GAME.ball.levelLightningDamageBonus;
      lightningEffect.config.additionalTargets = (
        lightningEffect.config.additionalTargets ?? GAME.upgrade.lightningAdditionalTargets
      ) + GAME.ball.levelLightningTargetBonus;
      skillBonuses.lightning = {
        damage: resolveAbilityDamage(ball, lightningEffect.config, GAME.upgrade.lightningDamage),
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
