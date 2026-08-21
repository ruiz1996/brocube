import { GAME } from '../config.js';
import { Paddle } from '../entities/entities.js';
import {
  LIGHTNING_BALL_ID,
  MICRO_NAVIGATION_BALL_ID,
  VOID_ORBIT_BALL_ID,
} from '../balls/BallDefinitionRegistry.js';

const UPGRADE_IDS = [
  'rapidFire',
  'multiShot',
  'rapidVolley',
  'doublePaddle',
  'topLaunch',
  'topRecovery',
  'blastLaunch',
  'blastCooldown',
  'voidOrbit',
  'voidOrbitSpeed',
  'microNavigation',
  'navigationStrength',
  'lightning',
  'lightningJumps',
  'ballSpeed',
  'ballDamage',
  'ballLives',
  'paddleLength',
  'bottomBounce',
];

const UPGRADE_PREREQUISITES = {
  topRecovery: 'topLaunch',
  blastCooldown: 'blastLaunch',
  voidOrbitSpeed: 'voidOrbit',
  navigationStrength: 'microNavigation',
  lightningJumps: 'lightning',
};

const UPGRADE_MAX_LEVEL_KEYS = {
  rapidFire: 'rapidFireMaxLevel',
  topLaunch: 'topLaunchMaxLevel',
  topRecovery: 'topRecoveryMaxLevel',
  blastLaunch: 'blastLaunchMaxLevel',
  blastCooldown: 'blastCooldownMaxLevel',
  voidOrbit: 'voidOrbitMaxLevel',
  voidOrbitSpeed: 'voidOrbiterSpeedMaxLevel',
  rapidVolley: 'rapidVolleyMaxLevel',
  doublePaddle: 'doublePaddleMaxLevel',
  microNavigation: 'microNavigationMaxLevel',
  navigationStrength: 'navigationStrengthMaxLevel',
  lightning: 'lightningMaxLevel',
  lightningJumps: 'lightningJumpsMaxLevel',
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
    this.levels = {
      rapidFire: 0,
      multiShot: 0,
      rapidVolley: 0,
      doublePaddle: 0,
      topLaunch: 0,
      topRecovery: 0,
      blastLaunch: 0,
      blastCooldown: 0,
      voidOrbit: 0,
      voidOrbitSpeed: 0,
      microNavigation: 0,
      navigationStrength: 0,
      lightning: 0,
      lightningJumps: 0,
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

  get newBallLives() {
    return GAME.ball.defaultLives
      + GAME.upgrade.ballLivesPerLevel * this.levels.ballLives;
  }

  get voidOrbiterAngularSpeed() {
    return GAME.upgrade.voidOrbiterAngularSpeed
      * GAME.upgrade.voidOrbiterSpeedMultiplierPerLevel ** this.levels.voidOrbitSpeed;
  }

  get navigationStrength() {
    return GAME.upgrade.navigationStrength
      * GAME.upgrade.navigationStrengthMultiplierPerLevel ** this.levels.navigationStrength;
  }

  get lightningAdditionalTargets() {
    return GAME.upgrade.lightningAdditionalTargets
      + GAME.upgrade.lightningAdditionalTargetsPerLevel * this.levels.lightningJumps;
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
    if (prerequisite && this.levels[prerequisite] === 0) return false;
    const maxLevelKey = UPGRADE_MAX_LEVEL_KEYS[id];
    return !maxLevelKey || this.levels[id] < GAME.upgrade[maxLevelKey];
  }

  choose(id) {
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
        if (ball.contactDamage !== false) ball.damage += GAME.upgrade.ballDamagePerLevel;
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
        const width = paddle.width * GAME.upgrade.doublePaddleWidthRatio;
        this.scene.world.add(new Paddle({
          role: 'secondary',
          x: paddle.x + paddle.width / 2 - width / 2,
          y: paddle.y - GAME.upgrade.doublePaddleVerticalOffset,
          width,
        }));
      }
    } else if (id === 'blastCooldown') {
      for (const ball of this.scene.world.all('ball')) {
        for (const effect of ball.periodicEffects) {
          if (effect.id !== 'area-blast') continue;
          effect.interval = this.blastInterval;
          effect.timeRemaining = Math.min(effect.timeRemaining, effect.interval);
        }
      }
    } else if (id === 'voidOrbitSpeed') {
      for (const ball of this.scene.world.all('ball')) {
        if (ball.definitionId !== VOID_ORBIT_BALL_ID) continue;
        for (const orbiter of ball.orbiters) {
          orbiter.angularSpeed = this.voidOrbiterAngularSpeed;
        }
      }
    } else if (id === 'navigationStrength') {
      for (const ball of this.scene.world.all('ball')) {
        if (ball.definitionId === MICRO_NAVIGATION_BALL_ID && ball.guidance) {
          ball.guidance.strength = this.navigationStrength;
        }
      }
    } else if (id === 'lightningJumps') {
      for (const ball of this.scene.world.all('ball')) {
        if (ball.definitionId !== LIGHTNING_BALL_ID) continue;
        const effect = ball.damageEffects.find(({ id: effectId }) => effectId === 'chain-lightning');
        if (effect) {
          effect.config.additionalTargets = this.lightningAdditionalTargets
            + (ball.level - 1) * GAME.ball.levelLightningTargetBonus;
        }
      }
    }

    this.scene.events.emit('upgrade:selected', {
      id,
      levels: { ...this.levels },
      pendingChoices: this.pendingChoices,
      nextScore: this.nextScore,
    });

    if (this.pendingChoices > 0) this.#offer();
    else this.scene.state = 'playing';
    return true;
  }

  options() {
    const candidates = [
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
        description: `额外球概率 ${Math.round(this.extraBallChance * 100)}% → ${Math.round((1 - (1 - GAME.upgrade.extraBallChancePerLevel) ** (this.levels.multiShot + 1)) * 100)}%；额外球随机方向，主球保持竖直`,
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
        description: `在主挡板上方增加一块宽度为主挡板 ${Math.round(GAME.upgrade.doublePaddleWidthRatio * 100)}% 的同步挡板`,
      },
      {
        id: 'ballSpeed',
        name: '动能超频',
        level: this.levels.ballSpeed,
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
        description: `微导航转向力度提升 ${Math.round((GAME.upgrade.navigationStrengthMultiplierPerLevel - 1) * 100)}%（最多 ${GAME.upgrade.navigationStrengthMaxLevel} 级）`,
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
    ].filter((option) => this.isAvailable(option.id));

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
    this.waitingForChoice = true;
    this.scene.state = 'upgrading';
    this.scene.events.emit('upgrade:offered', {
      options: this.options(),
      levels: { ...this.levels },
      pendingChoices: this.pendingChoices,
      nextScore: this.nextScore,
    });
  }
}
