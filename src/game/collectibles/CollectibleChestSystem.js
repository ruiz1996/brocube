const QUALITY_WEIGHTS = Object.freeze({
  common: 60,
  rare: 28,
  epic: 10,
  legendary: 2,
});

export class CollectibleChestSystem {
  constructor(scene) {
    this.scene = scene;
    this.random = Math.random;
  }

  open() {
    const inventory = this.scene.collectibles;
    if (!inventory || inventory.chests <= 0) return null;
    const candidates = inventory.catalogState().filter(({ capped }) => !capped);
    if (candidates.length === 0) return null;
    const qualityPools = new Map();
    for (const collectible of candidates) {
      const pool = qualityPools.get(collectible.quality) ?? [];
      pool.push(collectible);
      qualityPools.set(collectible.quality, pool);
    }
    const weightedQualities = Object.entries(QUALITY_WEIGHTS)
      .filter(([quality]) => qualityPools.has(quality));
    const totalWeight = weightedQualities.reduce((sum, [, weight]) => sum + weight, 0);
    let roll = this.random() * totalWeight;
    let selectedQuality = weightedQualities.at(-1)[0];
    for (const [quality, weight] of weightedQualities) {
      roll -= weight;
      if (roll < 0) {
        selectedQuality = quality;
        break;
      }
    }
    const qualityPool = qualityPools.get(selectedQuality);
    const selected = qualityPool[Math.min(
      qualityPool.length - 1,
      Math.floor(this.random() * qualityPool.length),
    )];
    if (!inventory.consumeChest()) return null;
    const granted = inventory.grant(selected.id);
    const result = {
      collectible: selected,
      previousLevel: granted.previousLevel,
      level: granted.level,
      remainingChests: inventory.chests,
    };
    this.scene.events.emit('collectible:chest-opened', result);
    return result;
  }
}
