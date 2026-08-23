import { GAME } from '../config.js';
import { Paddle } from '../entities/entities.js';
import { BALL_TRAITS } from '../balls/BallTraits.js';
import { addBallBaseDamage, setBallBaseDamage } from '../Damage.js';

const UPGRADE_IDS = [
  'rapidFire',
  'multiShot',
  'doubleShot',
  'rapidVolley',
  'doublePaddle',
  'topLaunch',
  'topRecovery',
  'topImpact',
  'blastLaunch',
  'blastCooldown',
  'blastImpact',
  'voidOrbit',
  'voidOrbitSpeed',
  'voidOrbitRadius',
  'microNavigation',
  'navigationStrength',
  'navigationReturn',
  'lightning',
  'lightningJumps',
  'lightningStrike',
  'ballSpeed',
  'ballDamage',
  'ballLives',
  'paddleLength',
  'bottomBounce',
];

const UPGRADE_PREREQUISITES = {
  doubleShot: { id: 'multiShot', level: 10 },
  topRecovery: 'topLaunch',
  topImpact: 'topLaunch',
  blastCooldown: 'blastLaunch',
  blastImpact: 'blastLaunch',
  voidOrbitSpeed: 'voidOrbit',
  voidOrbitRadius: 'voidOrbit',
  navigationStrength: 'microNavigation',
  navigationReturn: 'microNavigation',
  lightningJumps: 'lightning',
  lightningStrike: 'lightning',
};

const UPGRADE_MAX_LEVEL_KEYS = {
  rapidFire: 'rapidFireMaxLevel',
  multiShot: 'multiShotMaxLevel',
  doubleShot: 'doubleShotMaxLevel',
  topLaunch: 'topLaunchMaxLevel',
  topRecovery: 'topRecoveryMaxLevel',
  topImpact: 'topImpactMaxLevel',
  blastLaunch: 'blastLaunchMaxLevel',
  blastCooldown: 'blastCooldownMaxLevel',
  blastImpact: 'blastImpactMaxLevel',
  voidOrbit: 'voidOrbitMaxLevel',
  voidOrbitSpeed: 'voidOrbiterSpeedMaxLevel',
  voidOrbitRadius: 'voidOrbitRadiusMaxLevel',
  rapidVolley: 'rapidVolleyMaxLevel',
  doublePaddle: 'doublePaddleMaxLevel',
  microNavigation: 'microNavigationMaxLevel',
  navigationStrength: 'navigationStrengthMaxLevel',
  navigationReturn: 'navigationReturnMaxLevel',
  lightning: 'lightningMaxLevel',
  lightningJumps: 'lightningJumpsMaxLevel',
  lightningStrike: 'lightningStrikeMaxLevel',
  ballSpeed: 'ballSpeedMaxLevel',
  ballDamage: 'ballDamageMaxLevel',
  ballLives: 'ballLivesMaxLevel',
  paddleLength: 'paddleLengthMaxLevel',
  bottomBounce: 'bottomBounceMaxLevel',
};

export function calculateUpgradeScoreCost(upgradeIndex, config = GAME.upgrade) {
  const index = Math.max(0, upgradeIndex);
  const lateIndex = Math.max(0, index - (config.scoreLateGrowthStart ?? Infinity));
  const rawCost = config.scoreInterval * (
    1 + config.scoreGrowthCoefficient * index ** config.scoreGrowthExponent
      + (config.scoreLateGrowthCoefficient ?? 0)
        * lateIndex ** (config.scoreLateGrowthExponent ?? 1)
  );
  const rounding = Math.max(1, config.scoreCostRounding);
  return Math.max(rounding, Math.round(rawCost / rounding) * rounding);
}

export class UpgradeSystem {
  constructor(scene) {
    this.scene = scene;
    this.random = Math.random;
    this.reset();
  }

  reset() {
    this.autoUpgradeIds ??= new Set();
    this.levels = {
      rapidFire: 0,
      multiShot: 0,
      doubleShot: 0,
      rapidVolley: 0,
      doublePaddle: 0,
      topLaunch: 0,
      topRecovery: 0,
      topImpact: 0,
      blastLaunch: 0,
      blastCooldown: 0,
      blastImpact: 0,
      voidOrbit: 0,
      voidOrbitSpeed: 0,
      voidOrbitRadius: 0,
      microNavigation: 0,
      navigationStrength: 0,
      navigationReturn: 0,
      lightning: 0,
      lightningJumps: 0,
      lightningStrike: 0,
      ballSpeed: 0,
      ballDamage: 0,
      ballLives: 0,
      paddleLength: 0,
      bottomBounce: 0,
    };
    this.earnedChoices = 0;
    this.nextScore = calculateUpgradeScoreCost(0);
    this.pendingChoices = 0;
    this.waitingForChoice = false;
  }

  get fireInterval() {
    return Math.max(
      GAME.upgrade.minimumFireInterval,
      GAME.autoFireInterval * GAME.upgrade.rapidFireMultiplier ** this.levels.rapidFire,
    );
  }

  get extraBallChance() {
    return 1 - (1 - GAME.upgrade.extraBallChancePerLevel) ** this.levels.multiShot;
  }

  get rapidVolleyChance() {
    return Math.min(1, GAME.upgrade.rapidVolleyChancePerLevel * this.levels.rapidVolley);
  }

  get ballSpeedMultiplier() {
    return GAME.upgrade.ballSpeedMultiplierPerLevel ** this.levels.ballSpeed;
  }

  get ballDamageBonus() {
    return GAME.upgrade.ballDamagePerLevel * this.levels.ballDamage;
  }

  get topImpactDamageMultiplier() {
    return 1 + (GAME.upgrade.topLaunchSpeedMultiplier - 1)
      * GAME.upgrade.topImpactDamageScalePerLevel * this.levels.topImpact;
  }

  get newBallLives() {
    return GAME.ball.defaultLives
      + GAME.upgrade.ballLivesPerLevel * this.levels.ballLives;
  }

  get voidOrbiterAngularSpeed() {
    return GAME.upgrade.voidOrbiterAngularSpeed
      * GAME.upgrade.voidOrbiterSpeedMultiplierPerLevel ** this.levels.voidOrbitSpeed;
  }

  get voidOrbitRadius() {
    return GAME.upgrade.voidOrbitRadius
      * GAME.upgrade.voidOrbitRadiusMultiplierPerLevel ** this.levels.voidOrbitRadius;
  }

  get navigationStrength() {
    return GAME.upgrade.navigationStrength
      * GAME.upgrade.navigationStrengthMultiplierPerLevel ** this.levels.navigationStrength;
  }

  get navigationReturnChance() {
    return Math.min(
      1,
      GAME.upgrade.navigationReturnChancePerLevel * this.levels.navigationReturn,
    );
  }

  get lightningAdditionalTargets() {
    return GAME.upgrade.lightningAdditionalTargets
      + GAME.upgrade.lightningAdditionalTargetsPerLevel * this.levels.lightningJumps;
  }

  get lightningStrikeChance() {
    return Math.min(
      1,
      GAME.upgrade.lightningStrikeChancePerLevel * this.levels.lightningStrike,
    );
  }

  get blastImpactChance() {
    return Math.min(
      1,
      GAME.upgrade.blastImpactChancePerLevel * this.levels.blastImpact,
    );
  }

  get blastInterval() {
    return Math.max(
      GAME.upgrade.blastMinimumInterval,
      GAME.upgrade.blastInterval
        * GAME.upgrade.blastIntervalMultiplierPerLevel ** this.levels.blastCooldown,
    );
  }

  get topRecoveryChance() {
    return Math.min(
      1,
      GAME.upgrade.topRecoveryChancePerLevel * this.levels.topRecovery,
    );
  }

  get bottomBounceChance() {
    return Math.min(
      1,
      GAME.upgrade.bottomBounceChancePerLevel * this.levels.bottomBounce,
    );
  }

  get progressStartScore() {
    return this.nextScore - calculateUpgradeScoreCost(this.earnedChoices);
  }

  check(score) {
    while (score >= this.nextScore) {
      this.pendingChoices += 1;
      this.earnedChoices += 1;
      this.nextScore += calculateUpgradeScoreCost(this.earnedChoices);
    }
    if (this.pendingChoices > 0 && !this.waitingForChoice) this.#offer();
  }

  isAvailable(id) {
    if (!UPGRADE_IDS.includes(id)) return false;
    const prerequisite = UPGRADE_PREREQUISITES[id];
    if (typeof prerequisite === 'string' && this.levels[prerequisite] === 0) return false;
    if (prerequisite && typeof prerequisite === 'object'
      && this.levels[prerequisite.id] < prerequisite.level) return false;
    const maxLevelKey = UPGRADE_MAX_LEVEL_KEYS[id];
    return !maxLevelKey || this.levels[id] < GAME.upgrade[maxLevelKey];
  }

  setAutoUpgrade(id, enabled) {
    if (!UPGRADE_IDS.includes(id)) return false;
    if (enabled) this.autoUpgradeIds.add(id);
    else this.autoUpgradeIds.delete(id);
    this.scene.events.emit('upgrade:auto-changed', {
      id,
      enabled: this.autoUpgradeIds.has(id),
      autoUpgradeIds: [...this.autoUpgradeIds],
    });
    return true;
  }

  choose(id, { automatic = false } = {}) {
    if (!this.waitingForChoice || !this.isAvailable(id)) return false;
    this.levels[id] += 1;
    this.pendingChoices -= 1;
    this.waitingForChoice = false;

    if (id === 'rapidFire') {
      this.scene.autoFire.timeUntilShot = Math.min(this.scene.autoFire.timeUntilShot, this.fireInterval);
    } else if (id === 'ballSpeed') {
      const multiplier = GAME.upgrade.ballSpeedMultiplierPerLevel;
      for (const ball of this.scene.world.all('ball')) {
        ball.velocityX *= multiplier;
        ball.velocityY *= multiplier;
        ball.speed *= multiplier;
      }
    } else if (id === 'ballDamage') {
      for (const ball of this.scene.world.all('ball')) {
        if (ball.contactDamage !== false) addBallBaseDamage(ball, GAME.upgrade.ballDamagePerLevel);
      }
    } else if (id === 'paddleLength') {
      const paddle = this.scene.world.all('paddle').find(({ role }) => role === 'primary');
      if (paddle) {
        const center = paddle.x + paddle.width / 2;
        paddle.width = GAME.paddle.width * GAME.upgrade.paddleLengthMultiplierPerLevel ** this.levels.paddleLength;
        paddle.x = Math.max(14, Math.min(GAME.width - paddle.width - 14, center - paddle.width / 2));
      }
    } else if (id === 'doublePaddle') {
      const paddles = this.scene.world.all('paddle');
      const paddle = paddles.find(({ role }) => role === 'primary');
      if (paddle && !paddles.some(({ role }) => role === 'secondary')) {
        const width = paddle.width * Math.min(
          1,
          GAME.upgrade.doublePaddleWidthRatioPerLevel * this.levels.doublePaddle,
        );
        this.scene.world.add(new Paddle({
          role: 'secondary',
          x: paddle.x + paddle.width / 2 - width / 2,
          y: paddle.y - GAME.upgrade.doublePaddleVerticalOffset,
          width,
        }));
      }
    } else if (id === 'topImpact') {
      for (const ball of this.scene.world.all('ball')) {
        if (!ball.hasTrait(BALL_TRAITS.TOP_LAUNCH)) continue;
        if (ball.contactDamage !== false) {
          ball.contactDamageMultiplier = this.topImpactDamageMultiplier;
          setBallBaseDamage(ball, ball.baseDamage ?? ball.damage);
        }
        const lightningEffect = ball.damageEffects
          .find(({ id: effectId }) => effectId === 'chain-lightning');
        if (lightningEffect) {
          lightningEffect.config.damageMultiplier = this.topImpactDamageMultiplier;
        }
        for (const orbiter of ball.orbiters) {
          if (orbiter.payload?.traits?.has(BALL_TRAITS.TOP_LAUNCH)) {
            orbiter.payload.damageMultiplier = this.topImpactDamageMultiplier;
          }
        }
      }
    } else if (id === 'blastCooldown') {
      for (const ball of this.scene.world.all('ball')) {
        const effects = [
          ...ball.periodicEffects,
          ...ball.orbiters.flatMap((orbiter) => orbiter.payload?.periodicEffects ?? []),
        ];
        for (const effect of effects) {
          if (effect.id !== 'area-blast') continue;
          effect.interval = this.blastInterval;
          effect.timeRemaining = Math.min(effect.timeRemaining, effect.interval);
        }
      }
    } else if (id === 'blastImpact') {
      for (const ball of this.scene.world.all('ball')) {
        if (!ball.hasTrait(BALL_TRAITS.BLAST_CORE)) continue;
        const payloadHolders = ball.orbiters
          .map(({ payload }) => payload)
          .filter((payload) => payload?.traits?.has(BALL_TRAITS.BLAST_CORE));
        const abilityHolders = payloadHolders.length > 0 ? payloadHolders : [ball];
        for (const holder of abilityHolders) {
          let impact = holder.damageEffects.find(({ id: effectId }) => effectId === 'impact-blast');
          if (!impact) {
            impact = { id: 'impact-blast', config: {} };
            holder.damageEffects.push(impact);
          }
          const blast = holder.periodicEffects.find(({ id: effectId }) => effectId === 'area-blast');
          Object.assign(impact.config, {
            chance: this.blastImpactChance,
            damage: blast?.config.damage ?? GAME.upgrade.blastDamage,
            radius: blast?.config.radius ?? GAME.upgrade.blastRadius,
          });
        }
      }
    } else if (id === 'voidOrbitSpeed') {
      for (const ball of this.scene.world.all('ball')) {
        if (!ball.hasTrait(BALL_TRAITS.VOID_ORBIT)) continue;
        for (const orbiter of ball.orbiters) {
          orbiter.angularSpeed = this.voidOrbiterAngularSpeed;
        }
      }
    } else if (id === 'voidOrbitRadius') {
      for (const ball of this.scene.world.all('ball')) {
        if (!ball.hasTrait(BALL_TRAITS.VOID_ORBIT)) continue;
        for (const orbiter of ball.orbiters) orbiter.orbitRadius = this.voidOrbitRadius;
      }
    } else if (id === 'navigationStrength') {
      for (const ball of this.scene.world.all('ball')) {
        if (ball.hasTrait(BALL_TRAITS.MICRO_NAVIGATION) && ball.guidance) {
          ball.guidance.strength = this.navigationStrength;
        }
        for (const orbiter of ball.orbiters) {
          if (orbiter.payload?.guidance) orbiter.payload.guidance.strength = this.navigationStrength;
        }
      }
    } else if (id === 'navigationReturn') {
      for (const ball of this.scene.world.all('ball')) {
        if (ball.hasTrait(BALL_TRAITS.MICRO_NAVIGATION) && ball.guidance) {
          ball.guidance.returnStrikeChance = this.navigationReturnChance;
        }
        for (const orbiter of ball.orbiters) {
          if (orbiter.payload?.guidance) {
            orbiter.payload.guidance.returnStrikeChance = this.navigationReturnChance;
          }
        }
      }
    } else if (id === 'lightningJumps') {
      for (const ball of this.scene.world.all('ball')) {
        if (!ball.hasTrait(BALL_TRAITS.CHAIN_LIGHTNING)) continue;
        const effect = ball.damageEffects.find(({ id: effectId }) => effectId === 'chain-lightning');
        if (effect) {
          effect.config.additionalTargets = this.lightningAdditionalTargets
            + (ball.level - 1) * GAME.ball.levelLightningTargetBonus;
        }
        for (const orbiter of ball.orbiters) {
          const payloadEffect = orbiter.payload?.damageEffects
            ?.find(({ id: effectId }) => effectId === 'chain-lightning');
          if (payloadEffect) {
            payloadEffect.config.additionalTargets = this.lightningAdditionalTargets
              + (ball.level - 1) * GAME.ball.levelLightningTargetBonus;
          }
        }
      }
    } else if (id === 'lightningStrike') {
      for (const ball of this.scene.world.all('ball')) {
        if (!ball.hasTrait(BALL_TRAITS.CHAIN_LIGHTNING)) continue;
        const effect = ball.damageEffects.find(({ id: effectId }) => effectId === 'chain-lightning');
        if (effect) effect.config.strikeChance = this.lightningStrikeChance;
        for (const orbiter of ball.orbiters) {
          const payloadEffect = orbiter.payload?.damageEffects
            ?.find(({ id: effectId }) => effectId === 'chain-lightning');
          if (payloadEffect) payloadEffect.config.strikeChance = this.lightningStrikeChance;
        }
      }
    }

    const selectedOption = this.catalog().find(({ id: optionId }) => optionId === id);
    this.scene.events.emit('upgrade:selected', {
      id,
      name: selectedOption?.name ?? id,
      level: this.levels[id],
      maxLevel: selectedOption?.maxLevel ?? null,
      automatic,
      levels: { ...this.levels },
      pendingChoices: this.pendingChoices,
      nextScore: this.nextScore,
    });

    if (this.pendingChoices > 0) this.#offer();
    else this.scene.state = 'playing';
    return true;
  }

  catalog() {
    const navigationStrengthNextLevel = Math.min(
      this.levels.navigationStrength + 1,
      GAME.upgrade.navigationStrengthMaxLevel,
    );
    const navigationStrengthNext = GAME.upgrade.navigationStrength
      * GAME.upgrade.navigationStrengthMultiplierPerLevel ** navigationStrengthNextLevel;
    const navigationStrengthDescription = this.levels.navigationStrength
      >= GAME.upgrade.navigationStrengthMaxLevel
      ? `最大转向速度 ${this.navigationStrength.toFixed(2)} rad/s（已满级）`
      : `最大转向速度 ${this.navigationStrength.toFixed(2)} → ${navigationStrengthNext.toFixed(2)} rad/s（提升 ${Math.round((GAME.upgrade.navigationStrengthMultiplierPerLevel - 1) * 100)}%）`;
    return [
      {
        id: 'rapidFire',
        name: '高速装填',
        level: this.levels.rapidFire,
        maxLevel: GAME.upgrade.rapidFireMaxLevel,
        description: `发射间隔 ${this.fireInterval.toFixed(2)}s → ${Math.max(GAME.upgrade.minimumFireInterval, this.fireInterval * GAME.upgrade.rapidFireMultiplier).toFixed(2)}s`,
      },
      {
        id: 'multiShot',
        name: '分裂发射',
        level: this.levels.multiShot,
        maxLevel: GAME.upgrade.multiShotMaxLevel,
        description: `额外球概率 ${Math.round(this.extraBallChance * 100)}% → ${Math.round((1 - (1 - GAME.upgrade.extraBallChancePerLevel) ** (this.levels.multiShot + 1)) * 100)}%；额外球随机方向，主球保持竖直`,
      },
      {
        id: 'doubleShot',
        name: '二连发',
        level: this.levels.doubleShot,
        maxLevel: GAME.upgrade.doubleShotMaxLevel,
        prerequisiteText: '需要分裂发射达到10级',
        description: '每次发射必定独立抽取并发射两颗球，两颗球都有可能成为特殊球',
      },
      {
        id: 'rapidVolley',
        name: '五连速射',
        level: this.levels.rapidVolley,
        maxLevel: GAME.upgrade.rapidVolleyMaxLevel,
        description: `每轮有 ${Math.round(this.rapidVolleyChance * 100)}% → ${Math.round(Math.min(1, this.rapidVolleyChance + GAME.upgrade.rapidVolleyChancePerLevel) * 100)}% 概率快速发射 ${GAME.upgrade.rapidVolleyBallCount} 颗球`,
      },
      {
        id: 'doublePaddle',
        name: '双重挡板',
        level: this.levels.doublePaddle,
        maxLevel: GAME.upgrade.doublePaddleMaxLevel,
        description: `副挡板宽度增加主挡板的33%，当前 ${Math.round(GAME.upgrade.doublePaddleWidthRatioPerLevel * this.levels.doublePaddle * 100)}% → ${Math.round(Math.min(1, GAME.upgrade.doublePaddleWidthRatioPerLevel * (this.levels.doublePaddle + 1)) * 100)}%`,
      },
      {
        id: 'ballSpeed',
        name: '动能超频',
        level: this.levels.ballSpeed,
        maxLevel: GAME.upgrade.ballSpeedMaxLevel,
        description: `所有球速度提升 ${Math.round((GAME.upgrade.ballSpeedMultiplierPerLevel - 1) * 100)}%`,
      },
      {
        id: 'ballDamage',
        name: '攻击强化',
        level: this.levels.ballDamage,
        maxLevel: GAME.upgrade.ballDamageMaxLevel,
        description: `球的直接碰撞伤害额外 +${this.ballDamageBonus} → +${this.ballDamageBonus + GAME.upgrade.ballDamagePerLevel}；不影响爆炸、闪电链和虚空子球`,
      },
      {
        id: 'ballLives',
        name: '生命增幅',
        level: this.levels.ballLives,
        maxLevel: GAME.upgrade.ballLivesMaxLevel,
        description: `新生成球的生命 ${this.newBallLives} → ${this.newBallLives + GAME.upgrade.ballLivesPerLevel}（最多强化 ${GAME.upgrade.ballLivesMaxLevel} 次）`,
      },
      {
        id: 'topLaunch',
        name: '天顶增援',
        level: this.levels.topLaunch,
        maxLevel: GAME.upgrade.topLaunchMaxLevel,
        description: `加入特殊球池：与普通球等概率互相替代，并从顶部发射一颗 ${Math.round(GAME.upgrade.topLaunchSpeedMultiplier * 100)}% 速度球`,
      },
      {
        id: 'topImpact',
        name: '天顶冲击',
        level: this.levels.topImpact,
        maxLevel: GAME.upgrade.topImpactMaxLevel,
        prerequisiteText: '需要先解锁天顶增援',
        description: `将高速动能转化为碰撞伤害，伤害倍率 ${this.topImpactDamageMultiplier.toFixed(1)}× → ${(this.topImpactDamageMultiplier + (GAME.upgrade.topLaunchSpeedMultiplier - 1) * GAME.upgrade.topImpactDamageScalePerLevel).toFixed(1)}×`,
      },
      {
        id: 'blastLaunch',
        name: '爆裂核心',
        level: this.levels.blastLaunch,
        maxLevel: GAME.upgrade.blastLaunchMaxLevel,
        description: `加入特殊球池：与普通球等概率互相替代；每 ${GAME.upgrade.blastInterval.toFixed(1)} 秒对 ${GAME.upgrade.blastRadius} 范围内方块造成 ${GAME.upgrade.blastDamage} 点伤害`,
      },
      {
        id: 'blastCooldown',
        name: '爆裂增压',
        level: this.levels.blastCooldown,
        maxLevel: GAME.upgrade.blastCooldownMaxLevel,
        description: `爆炸间隔 ${this.blastInterval.toFixed(2)}s → ${Math.max(GAME.upgrade.blastMinimumInterval, this.blastInterval * GAME.upgrade.blastIntervalMultiplierPerLevel).toFixed(2)}s`,
      },
      {
        id: 'blastImpact',
        name: '爆裂触发',
        level: this.levels.blastImpact,
        maxLevel: GAME.upgrade.blastImpactMaxLevel,
        prerequisiteText: '需要先解锁爆裂核心',
        description: `碰撞方块时触发一次爆炸的概率 ${Math.round(this.blastImpactChance * 100)}% → ${Math.round(Math.min(1, this.blastImpactChance + GAME.upgrade.blastImpactChancePerLevel) * 100)}%`,
      },
      {
        id: 'voidOrbit',
        name: '虚空双星',
        level: this.levels.voidOrbit,
        maxLevel: GAME.upgrade.voidOrbitMaxLevel,
        description: `加入特殊球池：与普通球等概率互相替代；核心负责反弹，两颗环绕子球各造成 ${GAME.upgrade.voidOrbiterDamage} 点伤害`,
      },
      {
        id: 'voidOrbitSpeed',
        name: '虚空超旋',
        level: this.levels.voidOrbitSpeed,
        maxLevel: GAME.upgrade.voidOrbiterSpeedMaxLevel,
        description: `双星公转速度 ${this.voidOrbiterAngularSpeed.toFixed(2)} → ${(this.voidOrbiterAngularSpeed * GAME.upgrade.voidOrbiterSpeedMultiplierPerLevel).toFixed(2)}（每级提升 ${Math.round((GAME.upgrade.voidOrbiterSpeedMultiplierPerLevel - 1) * 100)}%，最多 ${GAME.upgrade.voidOrbiterSpeedMaxLevel} 级）`,
      },
      {
        id: 'voidOrbitRadius',
        name: '虚空扩轨',
        level: this.levels.voidOrbitRadius,
        maxLevel: GAME.upgrade.voidOrbitRadiusMaxLevel,
        prerequisiteText: '需要先解锁虚空双星',
        description: `子球旋转半径 ${this.voidOrbitRadius.toFixed(0)} → ${(this.voidOrbitRadius * GAME.upgrade.voidOrbitRadiusMultiplierPerLevel).toFixed(0)}（每级扩大20%）`,
      },
      {
        id: 'microNavigation',
        name: '微导航',
        level: this.levels.microNavigation,
        maxLevel: GAME.upgrade.microNavigationMaxLevel,
        description: '加入特殊球池：与普通球等概率互相替代；每次反弹锁定一块附近方块并轻微修正轨迹',
      },
      {
        id: 'navigationStrength',
        name: '导航增幅',
        level: this.levels.navigationStrength,
        maxLevel: GAME.upgrade.navigationStrengthMaxLevel,
        description: navigationStrengthDescription,
      },
      {
        id: 'navigationReturn',
        name: '导航回马枪',
        level: this.levels.navigationReturn,
        maxLevel: GAME.upgrade.navigationReturnMaxLevel,
        prerequisiteText: '需要先解锁微导航',
        description: `撞击后延迟反转并再次冲向原方块的基础概率 ${Math.round(this.navigationReturnChance * 100)}% → ${Math.round(Math.min(1, this.navigationReturnChance + GAME.upgrade.navigationReturnChancePerLevel) * 100)}%；连续触发概率递减`,
      },
      {
        id: 'lightning',
        name: '链式闪电',
        level: this.levels.lightning,
        maxLevel: GAME.upgrade.lightningMaxLevel,
        description: `加入特殊球池：与普通球等概率互相替代；碰撞不造成常规伤害，闪电命中当前方块并弹射 ${GAME.upgrade.lightningAdditionalTargets} 个额外目标`,
      },
      {
        id: 'lightningJumps',
        name: '闪电扩链',
        level: this.levels.lightningJumps,
        maxLevel: GAME.upgrade.lightningJumpsMaxLevel,
        description: `额外弹射目标 ${this.lightningAdditionalTargets} → ${this.lightningAdditionalTargets + GAME.upgrade.lightningAdditionalTargetsPerLevel}（最多强化 ${GAME.upgrade.lightningJumpsMaxLevel} 次）`,
      },
      {
        id: 'lightningStrike',
        name: '雷霆追击',
        level: this.levels.lightningStrike,
        maxLevel: GAME.upgrade.lightningStrikeMaxLevel,
        prerequisiteText: '需要先解锁链式闪电',
        description: `每段闪电链额外落雷的概率 ${Math.round(this.lightningStrikeChance * 100)}% → ${Math.round(Math.min(1, this.lightningStrikeChance + GAME.upgrade.lightningStrikeChancePerLevel) * 100)}%`,
      },
      {
        id: 'topRecovery',
        name: '天顶续航',
        level: this.levels.topRecovery,
        maxLevel: GAME.upgrade.topRecoveryMaxLevel,
        description: `天顶球触底额外获得 ${Math.round(this.topRecoveryChance * 100)}% → ${Math.round(Math.min(1, this.topRecoveryChance + GAME.upgrade.topRecoveryChancePerLevel) * 100)}% 保留判定`,
      },
      {
        id: 'paddleLength',
        name: '延展力场',
        level: this.levels.paddleLength,
        maxLevel: GAME.upgrade.paddleLengthMaxLevel,
        description: `挡板长度增加 ${Math.round((GAME.upgrade.paddleLengthMultiplierPerLevel - 1) * 100)}%（最多 ${GAME.upgrade.paddleLengthMaxLevel} 级）`,
      },
      {
        id: 'bottomBounce',
        name: '底线回响',
        level: this.levels.bottomBounce,
        maxLevel: GAME.upgrade.bottomBounceMaxLevel,
        description: `球触底时有 ${Math.round(this.bottomBounceChance * 100)}% → ${Math.round(Math.min(1, this.bottomBounceChance + GAME.upgrade.bottomBounceChancePerLevel) * 100)}% 概率反弹`,
      },
    ];
  }

  catalogState() {
    const catalog = this.catalog();
    const names = new Map(catalog.map(({ id, name }) => [id, name]));
    return catalog.map((option) => {
      const prerequisite = UPGRADE_PREREQUISITES[option.id];
      const prerequisiteMet = !prerequisite || (
        typeof prerequisite === 'string'
          ? this.levels[prerequisite] > 0
          : this.levels[prerequisite.id] >= prerequisite.level
      );
      const capped = Number.isFinite(option.maxLevel) && option.level >= option.maxLevel;
      return {
        ...option,
        prerequisiteText: option.prerequisiteText ?? (prerequisite
          ? `需要先解锁${names.get(typeof prerequisite === 'string' ? prerequisite : prerequisite.id)}`
          : null),
        prerequisiteMet,
        capped,
        available: this.isAvailable(option.id),
        autoSelected: this.autoUpgradeIds.has(option.id),
      };
    });
  }

  options() {
    const candidates = this.catalog().filter((option) => this.isAvailable(option.id));

    const lowPriorityIndex = candidates.findIndex(({ id }) => id === 'ballDamage');
    const lowPriorityOption = lowPriorityIndex >= 0
      ? candidates.splice(lowPriorityIndex, 1)[0]
      : null;

    for (let index = candidates.length - 1; index > 0; index -= 1) {
      const target = Math.floor(this.random() * (index + 1));
      [candidates[index], candidates[target]] = [candidates[target], candidates[index]];
    }
    const selected = candidates.slice(0, 3);
    if (lowPriorityOption && (
      selected.length < 3 || this.random() < GAME.upgrade.ballDamageOfferChance
    )) {
      if (selected.length >= 3) selected.pop();
      selected.push(lowPriorityOption);
    }
    for (let index = selected.length - 1; index > 0; index -= 1) {
      const target = Math.floor(this.random() * (index + 1));
      [selected[index], selected[target]] = [selected[target], selected[index]];
    }
    return selected;
  }

  #offer() {
    const options = this.options();
    if (options.length === 0) {
      this.pendingChoices = 0;
      this.waitingForChoice = false;
      this.scene.state = 'playing';
      this.scene.events.emit('upgrade:pool-exhausted', {
        levels: { ...this.levels },
        nextScore: this.nextScore,
      });
      return;
    }
    const automaticOptions = options.filter(({ id }) => this.autoUpgradeIds.has(id));
    if (automaticOptions.length > 0) {
      const selected = automaticOptions[
        Math.floor(this.random() * automaticOptions.length)
      ];
      this.waitingForChoice = true;
      this.choose(selected.id, { automatic: true });
      return;
    }
    this.waitingForChoice = true;
    this.scene.state = 'upgrading';
    this.scene.events.emit('upgrade:offered', {
      options,
      levels: { ...this.levels },
      pendingChoices: this.pendingChoices,
      nextScore: this.nextScore,
    });
  }
}
