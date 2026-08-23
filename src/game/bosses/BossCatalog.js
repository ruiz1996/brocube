export const BOSS_ARCHETYPES = Object.freeze({
  fortress: Object.freeze({
    label: 'FORTRESS',
    widthScale: 1.16,
    heightScale: 1,
    color: '#55e8ff',
    accent: '#d9fbff',
    coreColor: '#ffffff',
    armorScaleX: .78,
    armorScaleY: .58,
    dash: Object.freeze([10, 4]),
    sigil: 'cross',
    points: Object.freeze([
      [.32, 0], [.68, 0], [.88, .12], [1, .42], [.92, .82],
      [.68, 1], [.32, 1], [.08, .82], [0, .42], [.12, .12],
    ]),
  }),
  prism: Object.freeze({
    label: 'PRISM',
    widthScale: .9,
    heightScale: 1.22,
    color: '#9b6cff',
    accent: '#e2d5ff',
    coreColor: '#ffffff',
    armorScaleX: .6,
    armorScaleY: .74,
    dash: Object.freeze([3, 4]),
    sigil: 'diamond',
    points: Object.freeze([
      [.5, 0], [.82, .08], [1, .5], [.82, .92],
      [.5, 1], [.18, .92], [0, .5], [.18, .08],
    ]),
  }),
  bulwark: Object.freeze({
    label: 'BULWARK',
    widthScale: 1.08,
    heightScale: 1.14,
    color: '#ffad5a',
    accent: '#fff0c2',
    coreColor: '#fffdf0',
    armorScaleX: .76,
    armorScaleY: .72,
    dash: Object.freeze([12, 3]),
    sigil: 'chevron',
    points: Object.freeze([
      [.22, 0], [.78, 0], [1, .25], [.92, .68],
      [.5, 1], [.08, .68], [0, .25],
    ]),
  }),
  ram: Object.freeze({
    label: 'RAM',
    widthScale: 1.2,
    heightScale: .86,
    color: '#ff5c7d',
    accent: '#ffd5de',
    coreColor: '#fff7fa',
    armorScaleX: .68,
    armorScaleY: .56,
    dash: Object.freeze([5, 3]),
    sigil: 'horns',
    points: Object.freeze([
      [.18, 0], [.82, 0], [1, .5],
      [.82, 1], [.18, 1], [0, .5],
    ]),
  }),
});

export const BOSS_SHAPE_IDS = Object.freeze(Object.keys(BOSS_ARCHETYPES));

export function getBossArchetype(shapeId) {
  return BOSS_ARCHETYPES[shapeId] ?? BOSS_ARCHETYPES.fortress;
}

export function createBossPolygon(width, height, shapeId = BOSS_SHAPE_IDS[0]) {
  return getBossArchetype(shapeId).points.map(([x, y]) => ({
    x: x * width,
    y: y * height,
  }));
}

export function selectBossPolygon(width, height, random = Math.random) {
  const index = Math.min(BOSS_SHAPE_IDS.length - 1, Math.floor(random() * BOSS_SHAPE_IDS.length));
  const shapeId = BOSS_SHAPE_IDS[index];
  return { shapeId, points: createBossPolygon(width, height, shapeId) };
}

export class BossShapeBag {
  constructor(random = Math.random) {
    this.random = random;
    this.reset();
  }

  reset() {
    this.remaining = [];
    this.lastShapeId = null;
  }

  next() {
    if (this.remaining.length === 0) this.#refill();
    const shapeId = this.remaining.pop();
    this.lastShapeId = shapeId;
    return shapeId;
  }

  #refill() {
    this.remaining = [...BOSS_SHAPE_IDS];
    for (let index = this.remaining.length - 1; index > 0; index -= 1) {
      const target = Math.min(index, Math.floor(this.random() * (index + 1)));
      [this.remaining[index], this.remaining[target]] = [this.remaining[target], this.remaining[index]];
    }
    if (this.remaining.length > 1 && this.remaining.at(-1) === this.lastShapeId) {
      [this.remaining[0], this.remaining[this.remaining.length - 1]] = [
        this.remaining.at(-1),
        this.remaining[0],
      ];
    }
  }
}
