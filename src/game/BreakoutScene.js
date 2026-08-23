import { World } from '../core/Entity.js';
import { GAME } from './config.js';
import { Paddle } from './entities/entities.js';
import { PaddleSystem } from './systems/PaddleSystem.js';
import { AutoFireSystem } from './systems/AutoFireSystem.js';
import { BallPhysicsSystem } from './systems/BallPhysicsSystem.js';
import { BrickFieldSystem } from './systems/BrickFieldSystem.js';
import { EffectsSystem } from './systems/EffectsSystem.js';
import { UpgradeSystem } from './systems/UpgradeSystem.js';
import { BallCombatSystem } from './systems/BallCombatSystem.js';
import { BallAbilitySystem } from './systems/BallAbilitySystem.js';
import { OrbiterDamageSystem } from './systems/OrbiterDamageSystem.js';
import { GuidanceSystem } from './systems/GuidanceSystem.js';
import { BreakoutRenderer } from './BreakoutRenderer.js';
import { createDefaultBallDefinitions } from './balls/BallDefinitionRegistry.js';
import { BallFactory } from './balls/BallFactory.js';
import { createDefaultBallEmitters } from './emitters/BallEmitterRegistry.js';
import { createDefaultBallBehaviors } from './balls/BallBehaviorRegistry.js';
import { createDefaultBallRenderers } from './balls/BallRendererRegistry.js';
import { createDefaultBallFusions } from './balls/BallFusionRegistry.js';
import { calculateWorldLevelModifiers, normalizeWorldLevel } from './WorldLevel.js';
import { createCollectibleRunEffects } from './collectibles/CollectibleRunEffects.js';
import { CollectibleDropSystem } from './collectibles/CollectibleDropSystem.js';
import { CollectibleChestSystem } from './collectibles/CollectibleChestSystem.js';

export class BreakoutScene {
  enter(context) {
    Object.assign(this, context);
    this.worldLevel = normalizeWorldLevel(context.worldLevel);
    this.collectibleRun = createCollectibleRunEffects();
    this.world = new World();
    this.ballDefinitions = createDefaultBallDefinitions();
    this.ballFactory = new BallFactory(this.ballDefinitions);
    this.ballEmitters = createDefaultBallEmitters();
    this.ballBehaviors = createDefaultBallBehaviors();
    this.ballRenderers = createDefaultBallRenderers();
    this.ballFusions = createDefaultBallFusions();
    this.renderer = new BreakoutRenderer(this);
    this.upgrades = new UpgradeSystem(this);
    this.autoFire = new AutoFireSystem(this);
    this.ballCombat = new BallCombatSystem(this);
    this.ballAbilities = new BallAbilitySystem(this);
    this.ballPhysics = new BallPhysicsSystem(this);
    this.guidance = new GuidanceSystem(this);
    this.orbiterDamage = new OrbiterDamageSystem(this);
    this.brickField = new BrickFieldSystem(this);
    this.collectibleDrops = new CollectibleDropSystem(this);
    this.collectibleChests = new CollectibleChestSystem(this);
    this.systems = [
      new PaddleSystem(this),
      this.autoFire,
      this.guidance,
      this.ballPhysics,
      this.orbiterDamage,
      this.ballAbilities,
      this.brickField,
      new EffectsSystem(this),
    ];
    this.score = 0;
    this.state = 'idle';
    this.statsTimer = 0;
    this.unsubscribers = [
      this.events.on('brick:destroyed', (payload) => this.#onBrickDestroyed(payload)),
      this.events.on('brick:breached', (payload) => this.#onBrickBreached(payload)),
    ];
    this.#resetWorld();
    this.events.emit('game:ready', this.snapshot());
  }

  startNewGame() {
    this.score = 0;
    this.state = 'playing';
    this.statsTimer = 0;
    this.collectibleRun = createCollectibleRunEffects(this.collectibles?.snapshot());
    this.#resetWorld();
    this.engine.setPaused(false);
    this.events.emit('game:started', this.snapshot());
    this.events.emit('game:stats', this.snapshot());
  }

  settleRun() {
    if (!['playing', 'upgrading'].includes(this.state)) return null;
    this.state = 'settled';
    this.engine.setPaused(false);
    const result = {
      ...this.snapshot(),
      elapsed: this.brickField.elapsed,
      reason: 'manual-settlement',
    };
    this.events.emit('game:settled', result);
    this.events.emit('game:finished', result);
    return result;
  }

  update(dt) {
    if (this.state !== 'playing') return;
    for (const system of this.systems) {
      system.update?.(dt);
      if (this.state !== 'playing') break;
    }
    for (const brick of this.world.all('brick')) brick.hitFlash = Math.max(0, brick.hitFlash - dt * 7);
    this.world.flush();
    this.statsTimer -= dt;
    if (this.statsTimer <= 0) {
      this.statsTimer = .1;
      this.events.emit('game:stats', this.snapshot());
    }
  }

  render(ctx) { this.renderer.render(ctx); }

  chooseUpgrade(id) { return this.upgrades.choose(id); }

  openCollectibleChest() { return this.collectibleChests.open(); }

  setWorldLevel(level) {
    if (!['idle', 'lost', 'settled'].includes(this.state)) return false;
    const nextLevel = normalizeWorldLevel(level);
    if (nextLevel === this.worldLevel) return true;
    this.worldLevel = nextLevel;
    const snapshot = this.snapshot();
    this.events.emit('world-level:changed', snapshot);
    this.events.emit('game:stats', snapshot);
    return true;
  }

  increaseWorldLevel(amount = 1) {
    const increase = Math.max(1, Math.floor(Number(amount) || 1));
    return this.setWorldLevel(this.worldLevel + increase);
  }

  registerBallFusion(id, recipe) {
    this.ballFusions.register(id, recipe);
    this.events.emit('ball:fusion-registered', { id, recipe });
    return this;
  }

  configureAutoFire({ definitionId = this.autoFire.ballDefinitionId, emitterId = this.autoFire.emitterId }) {
    this.ballDefinitions.get(definitionId);
    if (!this.ballEmitters.has(emitterId)) throw new Error(`Unknown ball emitter: ${emitterId}`);
    this.autoFire.ballDefinitionId = definitionId;
    this.autoFire.emitterId = emitterId;
    this.events.emit('ball:loadout-changed', { definitionId, emitterId });
  }

  snapshot() {
    return {
      score: Math.round(this.score),
      balls: this.world.all('ball').length,
      nextShot: Math.max(0, this.autoFire?.timeUntilShot ?? 0),
      elapsed: this.brickField?.elapsed ?? 0,
      bossWave: this.brickField?.bossWaveCount ?? 0,
      bossRush: this.brickField?.bossRushActive ?? false,
      worldLevel: this.worldLevel,
      worldLevelModifiers: calculateWorldLevelModifiers(this.worldLevel),
      collectibleRun: this.collectibleRun?.snapshot() ?? null,
      upgrades: { ...this.upgrades.levels },
      upgradeProgressStart: this.upgrades.progressStartScore,
      nextUpgradeScore: this.upgrades.nextScore,
      earnedUpgradeChoices: this.upgrades.earnedChoices,
      state: this.state,
    };
  }

  #resetWorld() {
    this.world.clear();
    this.upgrades.reset();
    this.world.add(new Paddle({
      width: GAME.paddle.width * (this.collectibleRun?.paddleWidthMultiplier ?? 1),
    }));
    this.autoFire.reset();
    this.brickField.reset();
    this.world.flush();
  }

  #onBrickDestroyed({ brick }) {
    if (!['playing', 'upgrading'].includes(this.state)) return;
    const comboPlugin = this.plugins.plugins.get('combo-score');
    const multiplier = comboPlugin?.scoreMultiplier?.() ?? 1;
    this.score += brick.score * multiplier;
    this.events.emit('game:stats', this.snapshot());
    this.upgrades.check(this.score);
    this.collectibleDrops.handleBrickDestroyed(brick);
    this.brickField.handleBossDestroyed(brick);
  }

  #onBrickBreached({ brick, elapsed }) {
    if (this.state !== 'playing') return;
    this.state = 'lost';
    const result = {
      ...this.snapshot(),
      elapsed,
      breachedBrick: brick,
      reason: 'brick-breached',
    };
    this.events.emit('game:lost', result);
    this.events.emit('game:finished', result);
  }

  exit() {
    this.unsubscribers?.forEach((unsubscribe) => unsubscribe());
    this.systems?.forEach((system) => system.dispose?.());
    this.world?.clear();
  }
}
