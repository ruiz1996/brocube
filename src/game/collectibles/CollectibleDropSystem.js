import { calculateWorldLevelModifiers } from '../WorldLevel.js';

export class CollectibleDropSystem {
  constructor(scene) {
    this.scene = scene;
    this.random = Math.random;
  }

  handleBrickDestroyed(brick) {
    if (brick?.variant !== 'boss' || !this.scene.collectibles) return null;
    const worldExpectation = calculateWorldLevelModifiers(
      this.scene.worldLevel,
    ).bonusChestExpectation;
    const guaranteedWorldChests = Math.floor(worldExpectation);
    const fractionalWorldChance = worldExpectation - guaranteedWorldChests;
    const fractionalWorldChest = fractionalWorldChance > 0
      && this.random() < fractionalWorldChance;
    const starChartChest = this.scene.collectibleRun.rollBossExtraDrop();
    const chestCount = Math.min(
      Number.MAX_SAFE_INTEGER,
      1 + guaranteedWorldChests + Number(fractionalWorldChest) + Number(starChartChest),
    );
    this.scene.collectibles.grantChests(chestCount, 'boss');
    const result = {
      brick,
      chestCount,
      baseChests: 1,
      worldChests: guaranteedWorldChests + Number(fractionalWorldChest),
      worldExpectation,
      fractionalWorldChance,
      starChartChests: Number(starChartChest),
      starChartChance: this.scene.collectibleRun.bossExtraDropChance,
      totalChests: this.scene.collectibles.chests,
    };
    this.scene.events.emit('collectible:boss-chests', result);
    return result;
  }
}
