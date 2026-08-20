import { Brick } from '../entities/entities.js';
import { GAME } from '../config.js';

const PALETTE = ['#55e8ff', '#718bff', '#9b6cff', '#d760dc', '#ff5cab', '#ff796d', '#ffad5a'];
const randomBetween = (min, max) => min + Math.random() * (max - min);
const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));

function cross(origin, a, b) {
  return (a.x - origin.x) * (b.y - origin.y) - (a.y - origin.y) * (b.x - origin.x);
}

function convexHull(points) {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const lower = [];
  for (const point of sorted) {
    while (lower.length >= 2 && cross(lower.at(-2), lower.at(-1), point) <= 0) lower.pop();
    lower.push(point);
  }
  const upper = [];
  for (const point of sorted.reverse()) {
    while (upper.length >= 2 && cross(upper.at(-2), upper.at(-1), point) <= 0) upper.pop();
    upper.push(point);
  }
  lower.pop(); upper.pop();
  return lower.concat(upper);
}

function randomPolygon(width, height) {
  const candidates = [];
  const count = 7 + Math.floor(Math.random() * 6);
  for (let index = 0; index < count; index += 1) {
    const angle = (index / count) * Math.PI * 2 + randomBetween(-.16, .16);
    const radius = randomBetween(.72, 1);
    candidates.push({
      x: width / 2 + Math.cos(angle) * width * .5 * radius,
      y: height / 2 + Math.sin(angle) * height * .5 * radius,
    });
  }
  return convexHull(candidates);
}

export function selectBrickDimensions(random = Math.random, bounds = GAME.brick) {
  const widthProgress = random() ** bounds.widthBiasExponent;
  const heightProgress = random() ** bounds.heightBiasExponent;
  return {
    width: bounds.minWidth + (bounds.maxWidth - bounds.minWidth) * widthProgress,
    height: bounds.minHeight + (bounds.maxHeight - bounds.minHeight) * heightProgress,
  };
}

export function calculateExpectedBrickHitPoints({ elapsed, score }, formula = GAME.brick.healthFormula) {
  const minutes = Math.max(0, elapsed) / 60;
  const normalizedScore = Math.max(0, score) / Math.max(1, formula.scoreScale);
  return formula.baseHp
    + formula.timeCoefficient * minutes ** formula.timeExponent
    + formula.scoreCoefficient * normalizedScore ** formula.scoreExponent;
}

export function calculateBrickSizeHealthMultiplier(
  { width, height },
  bounds = GAME.brick,
  formula = bounds.healthFormula,
) {
  if (!Number.isFinite(width) || !Number.isFinite(height)) return 1;
  const minimumArea = bounds.minWidth * bounds.minHeight;
  const maximumArea = bounds.maxWidth * bounds.maxHeight;
  const areaProgress = Math.max(0, Math.min(
    1,
    (width * height - minimumArea) / Math.max(1, maximumArea - minimumArea),
  ));
  const minimumMultiplier = formula.sizeMinMultiplier ?? 1;
  const maximumMultiplier = formula.sizeMaxMultiplier ?? 1;
  const weightedProgress = areaProgress ** (formula.sizeExponent ?? 1);
  return minimumMultiplier
    + (maximumMultiplier - minimumMultiplier) * weightedProgress;
}

export function selectBrickHitPoints({ elapsed, score, width, height }, random = Math.random) {
  const formula = GAME.brick.healthFormula;
  const expected = calculateExpectedBrickHitPoints({ elapsed, score }, formula);
  const sizeMultiplier = calculateBrickSizeHealthMultiplier({ width, height }, GAME.brick, formula);
  const variation = (random() * 2 - 1) * formula.randomSpread;
  return Math.max(formula.minHp, Math.round(expected * sizeMultiplier + variation));
}

export class BrickFieldSystem {
  constructor(scene) {
    this.scene = scene;
    this.elapsed = 0;
    this.spawnTimer = 1;
    this.breached = false;
    this.nextBossWave = GAME.brick.bossWaveInterval;
  }

  reset() {
    this.elapsed = 0;
    this.spawnTimer = 1.4;
    this.breached = false;
    this.nextBossWave = GAME.brick.bossWaveInterval;
    const lanes = [1, 3, 5, 7, 2, 6, 4];
    lanes.forEach((lane, index) => this.#spawnBrick(
      lane,
      92 + Math.floor(index / 3) * 80 + Math.random() * 20,
      { laneCount: GAME.brick.spawnLaneCount },
    ));
  }

  update(dt) {
    this.elapsed += dt;
    if (this.scene.world.all('brick').length === 0) {
      this.#spawnClearRefillRow();
      this.spawnTimer = GAME.brick.initialSpawnInterval;
      return;
    }

    const speed = Math.min(
      GAME.brick.maxSpeed,
      GAME.brick.initialSpeed + this.elapsed * GAME.brick.speedGrowthPerSecond,
    );
    for (const brick of this.scene.world.all('brick')) {
      brick.y += speed * dt;
      if (!this.breached && brick.bottom() >= GAME.playBottom) {
        this.breached = true;
        this.scene.events.emit('brick:breached', { brick, elapsed: this.elapsed });
        return;
      }
    }

    if (this.elapsed >= this.nextBossWave) {
      while (this.nextBossWave <= this.elapsed) this.nextBossWave += GAME.brick.bossWaveInterval;
      this.#spawnBossWave();
      this.spawnTimer = Math.max(this.spawnTimer, GAME.brick.initialSpawnInterval * .7);
    }

    this.spawnTimer -= dt;
    if (this.spawnTimer > 0) return;
    this.#spawnBatch();
    const interval = Math.max(
      GAME.brick.minSpawnInterval,
      GAME.brick.initialSpawnInterval - this.elapsed * .012,
    );
    this.spawnTimer += interval * randomBetween(.82, 1.16);
  }

  #spawnBatch() {
    const laneCount = GAME.brick.spawnLaneCount;
    const firstLane = Math.floor(Math.random() * laneCount);
    this.#spawnBrick(firstLane, GAME.playTop + 13, { laneCount });
    if (Math.random() < Math.min(.65, .22 + this.elapsed / 180)) {
      let secondLane = Math.floor(Math.random() * laneCount);
      if (secondLane === firstLane) secondLane = (secondLane + 3) % laneCount;
      this.#spawnBrick(secondLane, GAME.playTop + 10, { laneCount });
    }
  }

  #spawnClearRefillRow() {
    const laneWidth = (
      GAME.width - GAME.brick.spawnSideMargin * 2
    ) / GAME.brick.clearRefillCount;
    const bricks = [];
    for (let lane = 0; lane < GAME.brick.clearRefillCount; lane += 1) {
      const width = randomBetween(GAME.brick.minWidth * .78, Math.min(GAME.brick.maxWidth * .82, laneWidth - 10));
      const height = randomBetween(GAME.brick.minHeight * .8, GAME.brick.maxHeight * .82);
      bricks.push(this.#spawnBrick(lane, GAME.playTop + 13, {
        laneCount: GAME.brick.clearRefillCount,
        width,
        height,
        horizontalJitter: 2,
      }));
    }
    this.scene.events.emit('brick:wave-refilled', { bricks, elapsed: this.elapsed });
  }

  #spawnBossWave() {
    const expectedHp = calculateExpectedBrickHitPoints({
      elapsed: this.elapsed,
      score: this.scene.score,
    });
    const hitPoints = Math.max(1, Math.ceil(expectedHp * GAME.brick.bossHealthMultiplier));
    const width = GAME.brick.bossWidth;
    const height = GAME.brick.bossHeight;
    const boss = this.#spawnBrick(4, GAME.playTop + 16, {
      width,
      height,
      x: (GAME.width - width) / 2,
      hitPoints,
      color: '#ff3f8f',
      score: 100 * hitPoints * GAME.brick.bossScoreMultiplier,
      variant: 'boss',
    });

    const minionLanes = [0, 1, 7, 8, 2, 6];
    const minions = [];
    for (let index = 0; index < GAME.brick.bossMinionCount; index += 1) {
      const lane = minionLanes[index % minionLanes.length];
      const secondRow = index >= 4;
      minions.push(this.#spawnBrick(lane, GAME.playTop + (secondRow ? 102 : 20), {
        width: randomBetween(GAME.brick.minWidth * .68, GAME.brick.minWidth * .88),
        height: randomBetween(GAME.brick.minHeight * .68, GAME.brick.minHeight * .9),
        horizontalJitter: 2,
        color: index % 2 === 0 ? '#9b6cff' : '#ff5cab',
        variant: 'boss-minion',
      }));
    }
    this.scene.events.emit('boss:wave', {
      boss,
      minions,
      wave: Math.floor(this.elapsed / GAME.brick.bossWaveInterval),
      elapsed: this.elapsed,
    });
  }

  #spawnBrick(lane, y, options = {}) {
    const laneCount = options.laneCount ?? 9;
    const sideMargin = GAME.brick.spawnSideMargin;
    const laneWidth = (GAME.width - sideMargin * 2) / laneCount;
    const dimensions = options.width === undefined || options.height === undefined
      ? selectBrickDimensions()
      : {};
    const width = options.width ?? dimensions.width;
    const height = options.height ?? dimensions.height;
    const horizontalJitter = options.horizontalJitter ?? 8;
    const proposedX = options.x
      ?? sideMargin + lane * laneWidth + (laneWidth - width) / 2
        + randomBetween(-horizontalJitter, horizontalJitter);
    const x = clamp(proposedX, sideMargin, GAME.width - sideMargin - width);
    const hitPoints = options.hitPoints ?? selectBrickHitPoints({
      elapsed: this.elapsed,
      score: this.scene.score,
      width,
      height,
    });
    return this.scene.world.add(new Brick({
      x, y, width, height,
      points: randomPolygon(width, height),
      hitPoints,
      color: options.color ?? PALETTE[Math.floor(Math.random() * PALETTE.length)],
      score: options.score ?? 100 * hitPoints,
      variant: options.variant ?? 'normal',
    }));
  }
}
