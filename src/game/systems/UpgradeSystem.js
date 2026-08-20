import { GAME } from '../config.js';

const UPGRADE_IDS = ['rapidFire', 'multiShot', 'ballSpeed', 'paddleLength', 'bottomBounce'];

export class UpgradeSystem {
  constructor(scene) {
    this.scene = scene;
    this.random = Math.random;
    this.reset();
  }

  reset() {
    this.levels = { rapidFire: 0, multiShot: 0, ballSpeed: 0, paddleLength: 0, bottomBounce: 0 };
    this.nextScore = GAME.upgrade.scoreInterval;
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

  get bottomBounceChance() {
    return Math.min(
      1,
      GAME.upgrade.bottomBounceChancePerLevel * this.levels.bottomBounce,
    );
  }

  check(score) {
    while (score >= this.nextScore) {
      this.pendingChoices += 1;
      this.nextScore += GAME.upgrade.scoreInterval;
    }
    if (this.pendingChoices > 0 && !this.waitingForChoice) this.#offer();
  }

  choose(id) {
    if (!this.waitingForChoice || !UPGRADE_IDS.includes(id)) return false;
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
    });
  }
}
