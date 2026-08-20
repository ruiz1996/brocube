import { GAME } from '../config.js';

const UPGRADE_IDS = [
  'rapidFire',
  'multiShot',
  'topLaunch',
  'blastLaunch',
  'ballSpeed',
  'paddleLength',
  'bottomBounce',
];

export function calculateUpgradeScoreCost(upgradeIndex, config = GAME.upgrade) {
  const index = Math.max(0, upgradeIndex);
  const rawCost = config.scoreInterval * (
    1 + config.scoreGrowthCoefficient * index ** config.scoreGrowthExponent
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
      topLaunch: 0,
      blastLaunch: 0,
      ballSpeed: 0,
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

  get ballSpeedMultiplier() {
    return GAME.upgrade.ballSpeedMultiplierPerLevel ** this.levels.ballSpeed;
  }

  get topLaunchChance() {
    return this.levels.topLaunch > 0 ? GAME.upgrade.topLaunchChance : 0;
  }

  get blastLaunchChance() {
    return this.levels.blastLaunch > 0 ? GAME.upgrade.blastLaunchChance : 0;
  }

  get bottomBounceChance() {
    return Math.min(
      1,
      GAME.upgrade.bottomBounceChancePerLevel * this.levels.bottomBounce,
    );
  }

  check(score) {
    while (score >= this.nextScore) {
      this.pendingChoices += 1;
      this.earnedChoices += 1;
      this.nextScore += calculateUpgradeScoreCost(this.earnedChoices);
    }
    if (this.pendingChoices > 0 && !this.waitingForChoice) this.#offer();
  }

  choose(id) {
    if (!this.waitingForChoice || !UPGRADE_IDS.includes(id)) return false;
    if (id === 'topLaunch' && this.levels.topLaunch >= GAME.upgrade.topLaunchMaxLevel) return false;
    if (id === 'blastLaunch' && this.levels.blastLaunch >= GAME.upgrade.blastLaunchMaxLevel) return false;
    if (id === 'paddleLength' && this.levels.paddleLength >= GAME.upgrade.paddleLengthMaxLevel) return false;
    if (id === 'bottomBounce' && this.levels.bottomBounce >= GAME.upgrade.bottomBounceMaxLevel) return false;
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
    } else if (id === 'paddleLength') {
      const paddle = this.scene.world.first('paddle');
      if (paddle) {
        const center = paddle.x + paddle.width / 2;
        paddle.width = GAME.paddle.width * GAME.upgrade.paddleLengthMultiplierPerLevel ** this.levels.paddleLength;
        paddle.x = Math.max(14, Math.min(GAME.width - paddle.width - 14, center - paddle.width / 2));
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
        description: `发射间隔 ${this.fireInterval.toFixed(2)}s → ${Math.max(GAME.upgrade.minimumFireInterval, this.fireInterval * GAME.upgrade.rapidFireMultiplier).toFixed(2)}s`,
      },
      {
        id: 'multiShot',
        name: '分裂发射',
        level: this.levels.multiShot,
        description: `额外球概率 ${Math.round(this.extraBallChance * 100)}% → ${Math.round((1 - (1 - GAME.upgrade.extraBallChancePerLevel) ** (this.levels.multiShot + 1)) * 100)}%，并解锁随机角度`,
      },
      {
        id: 'ballSpeed',
        name: '动能超频',
        level: this.levels.ballSpeed,
        description: `所有球速度提升 ${Math.round((GAME.upgrade.ballSpeedMultiplierPerLevel - 1) * 100)}%`,
      },
      {
        id: 'topLaunch',
        name: '天顶增援',
        level: this.levels.topLaunch,
        maxLevel: GAME.upgrade.topLaunchMaxLevel,
        description: `每次自动发射有 ${Math.round(GAME.upgrade.topLaunchChance * 100)}% 概率从顶部追加一颗 ${Math.round(GAME.upgrade.topLaunchSpeedMultiplier * 100)}% 速度球`,
      },
      {
        id: 'blastLaunch',
        name: '爆裂核心',
        level: this.levels.blastLaunch,
        maxLevel: GAME.upgrade.blastLaunchMaxLevel,
        description: `每次自动发射有 ${Math.round(GAME.upgrade.blastLaunchChance * 100)}% 概率追加爆裂球，每 ${GAME.upgrade.blastInterval.toFixed(1)} 秒对 ${GAME.upgrade.blastRadius} 范围内方块造成 ${GAME.upgrade.blastDamage} 点伤害`,
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
    ].filter((option) => option.maxLevel === undefined || option.level < option.maxLevel);

    for (let index = candidates.length - 1; index > 0; index -= 1) {
      const target = Math.floor(this.random() * (index + 1));
      [candidates[index], candidates[target]] = [candidates[target], candidates[index]];
    }
    return candidates.slice(0, 3);
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
