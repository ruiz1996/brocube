import { GAME } from '../config.js';
import { normalizeDamage, setBallBaseDamage } from '../Damage.js';
import { BALL_TRAITS } from '../balls/BallTraits.js';

const clampChance = (value) => Math.max(0, Math.min(1, value));

function level(levels, id) {
  return Math.min(
    Number.MAX_SAFE_INTEGER,
    Math.max(0, Math.floor(Number(levels?.[id]) || 0)),
  );
}

export function calculateCollectibleRunModifiers(snapshot = {}, config = GAME.collectible) {
  const levels = { ...(snapshot.levels ?? {}) };
  const globalDamageLevels = level(levels, 'photon-whetstone')
    + level(levels, 'dawn-calibrator');
  const fireIntervalReduction = (
    level(levels, 'secondhand-compressor') * config.commonFireIntervalReduction
    + level(levels, 'warp-escapement') * config.rareFireIntervalReduction
    + level(levels, 'zero-hour-hourglass') * config.epicFireIntervalReduction
  );
  return Object.freeze({
    levels: Object.freeze(levels),
    baseDamageMultiplier: Math.min(
      Number.MAX_SAFE_INTEGER,
      1 + globalDamageLevels * config.damagePercentPerLevel,
    ),
    flatBaseDamageBonus: (
      level(levels, 'assault-prism') * config.rareFlatDamagePerLevel
      + level(levels, 'starforge-heart') * config.epicFlatDamagePerLevel
    ),
    fireIntervalMultiplier: Math.max(
      config.minimumFireIntervalMultiplier,
      1 - fireIntervalReduction,
    ),
    extraSpecialBallChance: clampChance(
      level(levels, 'mirror-launch-spring') * config.extraSpecialBallChancePerLevel,
    ),
    paddleWidthMultiplier: 1
      + level(levels, 'extension-keel') * config.paddleWidthPercentPerLevel,
    bottomRetentionChance: clampChance(
      level(levels, 'return-membrane') * config.bottomRetentionChancePerLevel,
    ),
    bonusExperienceChance: clampChance(
      level(levels, 'hunter-calculus') * config.bonusExperienceChancePerLevel,
    ),
    recoilDamageMultiplier: 1
      + level(levels, 'recoil-capacitor') * config.recoilDamagePercentPerLevel,
    topSpeedDamageScaleBonus: level(levels, 'zenith-velocimeter')
      * config.topSpeedDamageScalePerLevel,
    blastFlatDamageBonus: level(levels, 'fusion-shock-ring')
      * config.blastFlatDamagePerLevel,
    blastRadiusBonus: level(levels, 'fusion-shock-ring')
      * config.blastRadiusPerLevel,
    voidOrbitRadiusMultiplier: 1
      + level(levels, 'gravity-dial') * config.voidRadiusPercentPerLevel,
    voidOrbitSpeedMultiplier: 1
      + level(levels, 'gravity-dial') * config.voidSpeedPercentPerLevel,
    navigationDamageMultiplier: 1
      + level(levels, 'starhunter-lens') * config.navigationDamagePercentPerLevel,
    lightningEchoChance: clampChance(
      level(levels, 'thunder-echo-vial') * config.lightningEchoChancePerLevel,
    ),
    bossExtraDropChance: clampChance(
      level(levels, 'expedition-star-chart') * config.bossExtraDropChancePerLevel,
    ),
    experienceMultiplier: 1
      + level(levels, 'ascension-memory-core') * config.experiencePercentPerLevel,
  });
}

export class CollectibleRunEffects {
  constructor(snapshot = {}, { random = Math.random, config = GAME.collectible } = {}) {
    this.random = random;
    this.modifiers = calculateCollectibleRunModifiers(snapshot, config);
    Object.assign(this, this.modifiers);
  }

  snapshot() { return { ...this.modifiers, levels: { ...this.levels } }; }

  roll(chance) {
    const resolved = clampChance(chance);
    return resolved > 0 && this.random() < resolved;
  }

  rollBonusExperience() { return this.roll(this.bonusExperienceChance); }

  rollLightningEcho() { return this.roll(this.lightningEchoChance); }

  rollBossExtraDrop() { return this.roll(this.bossExtraDropChance); }

  baseDamageGainMultiplier(ball) {
    return this.baseDamageMultiplier * (
      ball?.hasTrait?.(BALL_TRAITS.MICRO_NAVIGATION)
        ? this.navigationDamageMultiplier
        : 1
    );
  }

  scaleBaseDamageGain(amount, ball) {
    return normalizeDamage(amount * this.baseDamageGainMultiplier(ball));
  }

  applyBall(ball) {
    if (!ball || ball.collectibleRunApplied) return ball;
    ball.collectibleRunApplied = true;
    ball.collectibleBaseDamageGainMultiplier = this.baseDamageGainMultiplier(ball);
    setBallBaseDamage(
      ball,
      (ball.baseDamage + this.flatBaseDamageBonus)
        * ball.collectibleBaseDamageGainMultiplier,
    );

    const holders = [
      ball,
      ...ball.orbiters.map(({ payload }) => payload).filter(Boolean),
    ];
    for (const holder of holders) {
      for (const effect of holder.periodicEffects ?? []) {
        if (effect.id !== 'area-blast') continue;
        effect.config.flatDamageBonus = normalizeDamage(
          (effect.config.flatDamageBonus ?? 0) + this.blastFlatDamageBonus,
        );
        effect.config.radius = Math.max(
          1,
          (effect.config.radius ?? GAME.upgrade.blastRadius) + this.blastRadiusBonus,
        );
      }
      for (const effect of holder.damageEffects ?? []) {
        if (effect.id !== 'impact-blast') continue;
        effect.config.flatDamageBonus = normalizeDamage(
          (effect.config.flatDamageBonus ?? 0) + this.blastFlatDamageBonus,
        );
        effect.config.radius = Math.max(
          1,
          (effect.config.radius ?? GAME.upgrade.blastRadius) + this.blastRadiusBonus,
        );
      }
    }

    return ball;
  }
}

export function createCollectibleRunEffects(snapshot = {}, options = {}) {
  return new CollectibleRunEffects(snapshot, options);
}
