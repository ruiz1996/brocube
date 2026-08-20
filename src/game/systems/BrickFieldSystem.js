import { Brick } from '../entities/entities.js';
import { GAME } from '../config.js';

const PALETTE = ['#55e8ff', '#718bff', '#9b6cff', '#d760dc', '#ff5cab', '#ff796d', '#ffad5a'];
const randomBetween = (min, max) => min + Math.random() * (max - min);

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

export function calculateExpectedBrickHitPoints({ elapsed, score }, formula = GAME.brick.healthFormula) {
  const minutes = Math.max(0, elapsed) / 60;
  const normalizedScore = Math.max(0, score) / Math.max(1, formula.scoreScale);
  return formula.baseHp
    + formula.timeCoefficient * minutes ** formula.timeExponent
    + formula.scoreCoefficient * normalizedScore ** formula.scoreExponent;
}

export function selectBrickHitPoints({ elapsed, score }, random = Math.random) {
  const formula = GAME.brick.healthFormula;
  const expected = calculateExpectedBrickHitPoints({ elapsed, score }, formula);
  const variation = (random() * 2 - 1) * formula.randomSpread;
  return Math.max(formula.minHp, Math.round(expected + variation));
}

export class BrickFieldSystem {
  constructor(scene) {
    this.scene = scene;
    this.elapsed = 0;
    this.spawnTimer = 1;
    this.breached = false;
  }

  reset() {
    this.elapsed = 0;
    this.spawnTimer = 1.4;
    this.breached = false;
    const lanes = [1, 3, 5, 7, 2, 6, 4];
    lanes.forEach((lane, index) => this.#spawnBrick(lane, 92 + Math.floor(index / 3) * 80 + Math.random() * 20));
  }

  update(dt) {
    this.elapsed += dt;
    const speed = Math.min(GAME.brick.maxSpeed, GAME.brick.initialSpeed + this.elapsed * .14);
    for (const brick of this.scene.world.all('brick')) {
      brick.y += speed * dt;
      if (!this.breached && brick.bottom() >= GAME.playBottom) {
        this.breached = true;
        this.scene.events.emit('brick:breached', { brick, elapsed: this.elapsed });
        return;
      }
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
    const laneCount = 9;
    const firstLane = Math.floor(Math.random() * laneCount);
    this.#spawnBrick(firstLane, GAME.playTop + 13);
    if (Math.random() < Math.min(.65, .22 + this.elapsed / 180)) {
      let secondLane = Math.floor(Math.random() * laneCount);
      if (secondLane === firstLane) secondLane = (secondLane + 3) % laneCount;
      this.#spawnBrick(secondLane, GAME.playTop + 10);
    }
  }

  #spawnBrick(lane, y) {
    const laneWidth = (GAME.width - 34) / 9;
    const width = randomBetween(GAME.brick.minWidth, GAME.brick.maxWidth);
    const height = randomBetween(GAME.brick.minHeight, GAME.brick.maxHeight);
    const x = 17 + lane * laneWidth + (laneWidth - width) / 2 + randomBetween(-8, 8);
    const hitPoints = selectBrickHitPoints({
      elapsed: this.elapsed,
      score: this.scene.score,
    });
    this.scene.world.add(new Brick({
      x, y, width, height,
      points: randomPolygon(width, height),
      hitPoints,
      color: PALETTE[Math.floor(Math.random() * PALETTE.length)],
      score: 100 * hitPoints,
    }));
  }
}
