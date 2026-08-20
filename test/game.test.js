import assert from 'node:assert/strict';
import test from 'node:test';
import { EventBus } from '../src/core/EventBus.js';
import { Entity, World } from '../src/core/Entity.js';
import { GameEngine } from '../src/core/GameEngine.js';
import { BreakoutScene } from '../src/game/BreakoutScene.js';
import { GAME } from '../src/game/config.js';
import {
  calculateBrickSizeHealthMultiplier,
  calculateExpectedBrickHitPoints,
  selectBrickDimensions,
  selectBrickHitPoints,
} from '../src/game/systems/BrickFieldSystem.js';
import { calculateUpgradeScoreCost } from '../src/game/systems/UpgradeSystem.js';
import { calculateUpgradeProgress } from '../src/ui/GameUI.js';
import { ComboPlugin } from '../src/game/plugins/ComboPlugin.js';
import { BASIC_BALL_ID, createDefaultBallDefinitions } from '../src/game/balls/BallDefinitionRegistry.js';
import { BallFactory } from '../src/game/balls/BallFactory.js';
import { createDefaultBallEmitters } from '../src/game/emitters/BallEmitterRegistry.js';

test('EventBus 支持 once 和主动解绑', () => {
  const events = new EventBus();
  let onceCount = 0;
  let regularCount = 0;
  events.once('pulse', () => { onceCount += 1; });
  const off = events.on('pulse', () => { regularCount += 1; });
  events.emit('pulse');
  events.emit('pulse');
  off();
  events.emit('pulse');
  assert.equal(onceCount, 1);
  assert.equal(regularCount, 2);
});

test('World 延迟添加并清理销毁实体', () => {
  const world = new World();
  const entity = world.add(new Entity('test'));
  assert.equal(world.all().length, 0);
  world.flush();
  assert.equal(world.first('test'), entity);
  entity.destroy();
  world.flush();
  assert.equal(world.all().length, 0);
});

test('GameEngine 可以完成浏览器环境初始化', () => {
  globalThis.window = {
    addEventListener() {},
  };
  const canvas = {
    width: 0,
    height: 0,
    getContext() { return {}; },
    addEventListener() {},
  };
  const engine = new GameEngine({ canvas, width: 960, height: 600 });
  assert.equal(engine.width, 960);
  assert.equal(engine.height, 600);
  assert.equal(engine.running, false);
});

test('生存玩法可自动发球、击毁多边形且落球不结束游戏', () => {
  const events = new EventBus();
  const input = {
    pointer: { active: false, justPressed: false, x: 0, y: 0 },
    pressed() { return false; },
    isDown() { return false; },
  };
  const engine = { paused: false, setPaused(value) { this.paused = value; } };
  const scene = new BreakoutScene();
  scene.enter({
    engine,
    input,
    events,
    ctx: null,
    plugins: { plugins: new Map() },
  });

  scene.startNewGame();
  assert.equal(scene.state, 'playing');
  assert.equal(scene.world.all('ball').length, 0);
  const polygon = scene.world.first('brick');
  assert.ok(polygon.points.length >= 3);

  for (let index = 0; index < 40; index += 1) scene.update(1 / 120);
  const ball = scene.world.first('ball');
  assert.equal(scene.state, 'playing');
  assert.ok(ball);

  const brick = scene.world.first('brick');
  while (brick.active) scene.ballCombat.applyDamage({ ball, brick, damage: 1, cause: 'test' });
  scene.world.flush();
  assert.ok(scene.score >= 100);
  assert.equal(brick.active, false);

  ball.y = GAME.playBottom + 100;
  ball.velocityY = 100;
  scene.update(1 / 120);
  assert.equal(scene.state, 'playing');
  assert.equal(scene.world.all('ball').length, 0);

  const breachingBrick = scene.world.first('brick');
  breachingBrick.y = GAME.playBottom;
  scene.update(1 / 120);
  assert.equal(scene.state, 'lost');
  scene.exit();
});

test('球工厂保留特殊主球配置，但强制衍生球为基础球', () => {
  const definitions = createDefaultBallDefinitions();
  definitions.register('storm-piercer', {
    damage: 4,
    damageType: 'electric',
    radius: 10,
    speedMultiplier: 1.2,
    damageEffects: ['chain-lightning'],
    periodicEffects: [{ id: 'energy-pulse', interval: 2, config: { radius: 80 } }],
    collisionPolicy: 'pierce',
    collisionConfig: { remainingPierces: 3 },
    visual: { color: '#a88cff', renderer: 'orb' },
  });
  const factory = new BallFactory(definitions);

  const primary = factory.createPrimary({ definitionId: 'storm-piercer', x: 20, y: 30, angle: 0 });
  assert.equal(primary.definitionId, 'storm-piercer');
  assert.equal(primary.role, 'primary');
  assert.equal(primary.damage, 4);
  assert.equal(primary.damageType, 'electric');
  assert.deepEqual(primary.damageEffects, [{ id: 'chain-lightning', config: {} }]);
  assert.equal(primary.collisionPolicy, 'pierce');
  assert.equal(primary.collisionState.remainingPierces, 3);
  assert.equal(primary.periodicEffects[0].id, 'energy-pulse');
  assert.equal(primary.periodicEffects[0].timeRemaining, 2);

  const derived = factory.createDerived({ x: 20, y: 30, angle: 0 });
  assert.equal(derived.definitionId, BASIC_BALL_ID);
  assert.equal(derived.role, 'derived');
  assert.equal(derived.radius, GAME.ball.derivedRadius);
  assert.equal(derived.damage, 1);
  assert.equal(derived.damageType, 'kinetic');
  assert.deepEqual(derived.damageEffects, []);
  assert.deepEqual(derived.periodicEffects, []);
  assert.equal(derived.collisionPolicy, 'bounce');
  assert.deepEqual(derived.collisionConfig, {});
});

test('发射器可独立切换挡板发射和顶部发射', () => {
  const emitters = createDefaultBallEmitters();
  const scene = {
    world: {
      first(type) {
        return type === 'paddle' ? { x: 100, y: 500, width: 120 } : null;
      },
    },
  };
  const paddleShot = emitters.createShot('paddle', {
    scene,
    random: () => .5,
    randomized: false,
    radius: GAME.ball.radius,
  });
  assert.equal(paddleShot.x, 160);
  assert.equal(paddleShot.angle, -Math.PI / 2);

  const topShot = emitters.createShot('top', {
    scene,
    random: () => .5,
    radius: GAME.ball.radius,
  });
  assert.equal(topShot.y, GAME.playTop + GAME.ball.radius + 3);
  assert.ok(Math.sin(topShot.angle) > 0);
});

test('普通方块尺寸采样偏向横向扁长并保留随机范围', () => {
  assert.ok(GAME.brick.minWidth >= 34 * 1.2);
  assert.ok(GAME.brick.maxWidth >= 61 * 1.2);
  assert.ok(GAME.brick.minHeight >= 26 * 1.2);
  assert.ok(GAME.brick.maxHeight >= 46 * 1.2);
  const middle = selectBrickDimensions(() => .5);
  assert.ok(middle.width / middle.height > 1.5);

  const sequence = [0, 0, 1, 1];
  const minimum = selectBrickDimensions(() => sequence.shift());
  const maximum = selectBrickDimensions(() => sequence.shift());
  assert.deepEqual(minimum, { width: GAME.brick.minWidth, height: GAME.brick.minHeight });
  assert.deepEqual(maximum, { width: GAME.brick.maxWidth, height: GAME.brick.maxHeight });
});

test('碰撞策略可穿透后回退为反弹，分裂只创建基础衍生球', () => {
  const events = new EventBus();
  const input = { pointer: { active: false, justPressed: false }, pressed() { return false; }, isDown() { return false; } };
  const scene = new BreakoutScene();
  scene.enter({
    engine: { setPaused() {} }, input, events, ctx: null,
    plugins: { plugins: new Map() },
  });
  scene.startNewGame();
  const brick = scene.world.first('brick');
  brick.hitPoints = 20;
  brick.maxHitPoints = 20;

  scene.ballDefinitions.register('test-pierce', {
    damage: 2,
    collisionPolicy: 'pierce',
    collisionConfig: { remainingPierces: 1 },
  });
  const piercer = scene.ballFactory.createPrimary({ definitionId: 'test-pierce', x: brick.x, y: brick.y, angle: 0 });
  scene.world.add(piercer);
  scene.world.flush();
  const firstVelocity = piercer.velocityX;
  scene.ballCombat.resolveBrickCollision({ ball: piercer, brick, normal: { nx: -1, ny: 0, depth: 1 } });
  assert.equal(brick.hitPoints, 18);
  assert.equal(piercer.velocityX, firstVelocity);
  assert.equal(piercer.collisionState.remainingPierces, 0);
  assert.equal(
    scene.ballCombat.resolveBrickCollision({ ball: piercer, brick, normal: { nx: -1, ny: 0, depth: 1 } }),
    null,
  );
  assert.equal(brick.hitPoints, 18);
  piercer.brickContacts.clear();
  scene.ballCombat.resolveBrickCollision({ ball: piercer, brick, normal: { nx: -1, ny: 0, depth: 1 } });
  assert.ok(piercer.velocityX < 0);

  scene.ballDefinitions.register('test-split', {
    damage: 1,
    collisionPolicy: 'split',
    collisionConfig: { splitCount: 2 },
  });
  const splitter = scene.ballFactory.createPrimary({ definitionId: 'test-split', x: brick.x, y: brick.y, angle: 0 });
  scene.world.add(splitter);
  scene.world.flush();
  const result = scene.ballCombat.resolveBrickCollision({
    ball: splitter,
    brick,
    normal: { nx: -1, ny: 0, depth: 1 },
  });
  scene.world.flush();
  assert.equal(result.action, 'split');
  assert.equal(splitter.active, false);
  assert.equal(result.derivedBalls.length, 2);
  assert.ok(result.derivedBalls.every((ball) => (
    ball.definitionId === BASIC_BALL_ID
    && ball.role === 'derived'
    && ball.collisionPolicy === 'bounce'
    && ball.damageEffects.length === 0
  )));
  scene.exit();
});

test('挡板每三秒自动发射一颗新球', () => {
  const events = new EventBus();
  const input = { pointer: { active: false, justPressed: false }, pressed() { return false; }, isDown() { return false; } };
  const scene = new BreakoutScene();
  let launches = 0;
  events.on('ball:launched', () => { launches += 1; });
  scene.enter({
    engine: { setPaused() {} }, input, events, ctx: null,
    plugins: { plugins: new Map() },
  });
  scene.startNewGame();
  for (let index = 0; index < 800; index += 1) scene.update(1 / 120);
  assert.equal(GAME.autoFireInterval, 3);
  assert.equal(launches, 3);
  scene.exit();
});

test('天顶增援有25%概率追加一颗双倍速度的顶部球', () => {
  const events = new EventBus();
  const input = { pointer: { active: false, justPressed: false }, pressed() { return false; }, isDown() { return false; } };
  const scene = new BreakoutScene();
  const launches = [];
  events.on('ball:launched', (payload) => launches.push(payload));
  scene.enter({
    engine: { setPaused() {} }, input, events, ctx: null,
    plugins: { plugins: new Map() },
  });
  scene.startNewGame();
  scene.upgrades.waitingForChoice = true;
  scene.upgrades.pendingChoices = 1;
  scene.state = 'upgrading';
  assert.equal(scene.chooseUpgrade('topLaunch'), true);
  assert.equal(scene.upgrades.levels.topLaunch, 1);
  assert.equal(scene.upgrades.topLaunchChance, .25);

  scene.autoFire.random = () => 0;
  scene.autoFire.timeUntilShot = 0;
  scene.update(1 / 120);
  assert.equal(launches.length, 2);

  const regularLaunch = launches.find(({ emitterId }) => emitterId === 'paddle');
  const topLaunch = launches.find(({ emitterId }) => emitterId === 'top');
  assert.ok(regularLaunch);
  assert.equal(topLaunch.source, 'top-launch');
  assert.equal(topLaunch.ball.launchSource, 'top-launch');
  assert.ok(topLaunch.ball.velocityY > 0);
  assert.equal(topLaunch.ball.visual.renderer, 'top-launch');
  assert.equal(topLaunch.ball.visual.color, '#ffad5a');
  assert.equal(topLaunch.ball.visual.trailLength, 16);
  const regularSpeed = Math.hypot(regularLaunch.ball.velocityX, regularLaunch.ball.velocityY);
  const topSpeed = Math.hypot(topLaunch.ball.velocityX, topLaunch.ball.velocityY);
  assert.ok(Math.abs(topSpeed / regularSpeed - GAME.upgrade.topLaunchSpeedMultiplier) < .0001);
  assert.equal(scene.world.all('particle').length, 20);
  assert.equal(scene.upgrades.options().some((option) => option.id === 'topLaunch'), false);
  scene.exit();
});

test('爆裂核心有25%概率发射带周期范围伤害和独特外观的球', () => {
  const events = new EventBus();
  const input = { pointer: { active: false, justPressed: false }, pressed() { return false; }, isDown() { return false; } };
  const scene = new BreakoutScene();
  const launches = [];
  const explosions = [];
  events.on('ball:launched', (payload) => launches.push(payload));
  events.on('ball:exploded', (payload) => explosions.push(payload));
  scene.enter({
    engine: { setPaused() {} }, input, events, ctx: null,
    plugins: { plugins: new Map() },
  });
  scene.startNewGame();
  scene.upgrades.waitingForChoice = true;
  scene.upgrades.pendingChoices = 1;
  scene.state = 'upgrading';
  assert.equal(scene.chooseUpgrade('blastLaunch'), true);
  assert.equal(scene.upgrades.levels.blastLaunch, 1);
  assert.equal(scene.upgrades.blastLaunchChance, .25);

  scene.autoFire.random = () => 0;
  scene.autoFire.timeUntilShot = 0;
  scene.update(1 / 120);
  assert.equal(launches.length, 2);
  const blastLaunch = launches.find(({ source }) => source === 'blast-launch');
  assert.ok(blastLaunch);
  assert.equal(blastLaunch.emitterId, 'paddle');
  assert.equal(blastLaunch.ball.launchSource, 'blast-launch');
  assert.equal(blastLaunch.ball.visual.renderer, 'blast-core');
  assert.equal(blastLaunch.ball.visual.trailLength, 12);
  assert.equal(blastLaunch.ball.periodicEffects.length, 1);
  assert.equal(blastLaunch.ball.periodicEffects[0].id, 'area-blast');

  const target = scene.world.first('brick');
  target.hitPoints = 10;
  target.maxHitPoints = 10;
  blastLaunch.ball.x = target.x + target.width / 2;
  blastLaunch.ball.y = target.y + target.height / 2;
  const farBrick = scene.world.all('brick').find((brick) => (
    Math.hypot(
      brick.x + brick.width / 2 - blastLaunch.ball.x,
      brick.y + brick.height / 2 - blastLaunch.ball.y,
    ) > GAME.upgrade.blastRadius + 40
  ));
  if (farBrick) {
    farBrick.hitPoints = 10;
    farBrick.maxHitPoints = 10;
  }

  scene.ballAbilities.update(GAME.upgrade.blastInterval);
  scene.world.flush();
  assert.equal(explosions.length, 1);
  assert.equal(explosions[0].radius, GAME.upgrade.blastRadius);
  assert.ok(explosions[0].hitBricks.includes(target));
  assert.equal(target.hitPoints, 9);
  if (farBrick) assert.equal(farBrick.hitPoints, 10);
  assert.equal(scene.world.all('blast-wave').length, 1);
  assert.ok(scene.world.all('particle').length >= 26);
  assert.equal(scene.upgrades.options().some((option) => option.id === 'blastLaunch'), false);
  scene.exit();
});

test('特殊球进阶卡需要前置，爆裂增压会缩短现有与未来爆裂球间隔', () => {
  const events = new EventBus();
  const input = { pointer: { active: false, justPressed: false }, pressed() { return false; }, isDown() { return false; } };
  const scene = new BreakoutScene();
  scene.enter({
    engine: { setPaused() {} }, input, events, ctx: null,
    plugins: { plugins: new Map() },
  });
  scene.startNewGame();

  const prepareChoice = () => {
    scene.upgrades.waitingForChoice = true;
    scene.upgrades.pendingChoices = 1;
    scene.state = 'upgrading';
  };

  assert.equal(scene.upgrades.isAvailable('blastCooldown'), false);
  prepareChoice();
  assert.equal(scene.chooseUpgrade('blastCooldown'), false);
  assert.equal(scene.chooseUpgrade('blastLaunch'), true);
  assert.equal(scene.upgrades.isAvailable('blastCooldown'), true);

  scene.autoFire.random = () => 0;
  scene.autoFire.timeUntilShot = 0;
  scene.update(1 / 120);
  const firstBlast = scene.world.all('ball').find((ball) => ball.launchSource === 'blast-launch');
  const firstEffect = firstBlast.periodicEffects.find((effect) => effect.id === 'area-blast');
  assert.equal(firstEffect.interval, GAME.upgrade.blastInterval);

  prepareChoice();
  assert.equal(scene.chooseUpgrade('blastCooldown'), true);
  assert.equal(scene.upgrades.levels.blastCooldown, 1);
  assert.ok(scene.upgrades.blastInterval < GAME.upgrade.blastInterval);
  assert.equal(firstEffect.interval, scene.upgrades.blastInterval);
  assert.ok(firstEffect.timeRemaining <= firstEffect.interval);

  for (let level = 1; level < GAME.upgrade.blastCooldownMaxLevel; level += 1) {
    prepareChoice();
    assert.equal(scene.chooseUpgrade('blastCooldown'), true);
  }
  assert.equal(scene.upgrades.isAvailable('blastCooldown'), false);

  scene.autoFire.timeUntilShot = 0;
  scene.update(1 / 120);
  const blastEffects = scene.world.all('ball')
    .filter((ball) => ball.launchSource === 'blast-launch')
    .map((ball) => ball.periodicEffects.find((effect) => effect.id === 'area-blast'));
  assert.equal(blastEffects.length, 2);
  assert.ok(blastEffects.every((effect) => effect.interval === scene.upgrades.blastInterval));
  scene.exit();
});

test('天顶续航在普通底线判定失败后为天顶球追加独立保留判定', () => {
  const events = new EventBus();
  const input = { pointer: { active: false, justPressed: false }, pressed() { return false; }, isDown() { return false; } };
  const scene = new BreakoutScene();
  const saves = [];
  events.on('ball:saved', (payload) => saves.push(payload));
  scene.enter({
    engine: { setPaused() {} }, input, events, ctx: null,
    plugins: { plugins: new Map() },
  });
  scene.startNewGame();

  const prepareChoice = () => {
    scene.upgrades.waitingForChoice = true;
    scene.upgrades.pendingChoices = 1;
    scene.state = 'upgrading';
  };

  assert.equal(scene.upgrades.isAvailable('topRecovery'), false);
  prepareChoice();
  assert.equal(scene.chooseUpgrade('topRecovery'), false);
  assert.equal(scene.chooseUpgrade('topLaunch'), true);
  assert.equal(scene.upgrades.isAvailable('topRecovery'), true);
  prepareChoice();
  assert.equal(scene.chooseUpgrade('topRecovery'), true);
  assert.equal(scene.upgrades.topRecoveryChance, GAME.upgrade.topRecoveryChancePerLevel);

  scene.autoFire.random = () => 0;
  scene.autoFire.timeUntilShot = 0;
  scene.update(1 / 120);
  const topBall = scene.world.all('ball').find((ball) => ball.launchSource === 'top-launch');
  topBall.y = GAME.playBottom + topBall.radius + 1;
  topBall.velocityY = 100;
  scene.ballPhysics.random = () => .2;
  scene.ballPhysics.update(0);
  assert.equal(topBall.active, true);
  assert.ok(topBall.velocityY < 0);
  assert.equal(saves.at(-1).reason, 'top-recovery');

  const regularBall = scene.ballFactory.createPrimary({
    x: GAME.width / 2,
    y: GAME.playBottom + GAME.ball.radius + 1,
    angle: Math.PI / 2,
    launchSource: 'automatic',
  });
  scene.world.add(regularBall);
  scene.world.flush();
  scene.ballPhysics.update(0);
  assert.equal(regularBall.active, false);
  scene.exit();
});

test('方块血量按可调公式随时间和分数无上限增长', () => {
  assert.equal(calculateExpectedBrickHitPoints({ elapsed: 0, score: 0 }), 1.4);
  assert.ok(calculateExpectedBrickHitPoints({ elapsed: 60, score: 0 }) > 2);
  assert.ok(calculateExpectedBrickHitPoints({ elapsed: 0, score: 5000 }) > 2);
  assert.ok(calculateExpectedBrickHitPoints({ elapsed: 600, score: 100000 }) > 15);
  assert.equal(selectBrickHitPoints({ elapsed: 0, score: 0 }, () => .5), 1);

  const smallest = { width: GAME.brick.minWidth, height: GAME.brick.minHeight };
  const largest = { width: GAME.brick.maxWidth, height: GAME.brick.maxHeight };
  assert.equal(
    calculateBrickSizeHealthMultiplier(smallest),
    GAME.brick.healthFormula.sizeMinMultiplier,
  );
  assert.equal(
    calculateBrickSizeHealthMultiplier(largest),
    GAME.brick.healthFormula.sizeMaxMultiplier,
  );
  const smallHighRoll = selectBrickHitPoints({ elapsed: 0, score: 0, ...smallest }, () => 1);
  const largeLowRoll = selectBrickHitPoints({ elapsed: 0, score: 0, ...largest }, () => 0);
  assert.ok(largeLowRoll > smallHighRoll);

  const customFormula = {
    baseHp: 2,
    timeCoefficient: 2,
    timeExponent: 1,
    scoreCoefficient: 3,
    scoreScale: 1000,
    scoreExponent: 1,
  };
  assert.equal(
    calculateExpectedBrickHitPoints({ elapsed: 120, score: 2000 }, customFormula),
    12,
  );
});

test('每三分钟生成包含Boss和小方块的Boss波次', () => {
  const events = new EventBus();
  const input = { pointer: { active: false, justPressed: false }, pressed() { return false; }, isDown() { return false; } };
  const scene = new BreakoutScene();
  const waves = [];
  events.on('boss:wave', (payload) => waves.push(payload));
  scene.enter({
    engine: { setPaused() {} }, input, events, ctx: null,
    plugins: { plugins: new Map() },
  });
  scene.startNewGame();
  scene.brickField.elapsed = GAME.brick.bossWaveInterval - .01;
  scene.brickField.nextBossWave = GAME.brick.bossWaveInterval;
  scene.brickField.update(.02);
  scene.world.flush();

  const bosses = scene.world.all('brick').filter((brick) => brick.variant === 'boss');
  const minions = scene.world.all('brick').filter((brick) => brick.variant === 'boss-minion');
  assert.equal(waves.length, 1);
  assert.equal(bosses.length, 1);
  assert.equal(minions.length, GAME.brick.bossMinionCount);
  assert.equal(waves[0].wave, 1);
  assert.ok(bosses[0].maxHitPoints > Math.max(...minions.map((brick) => brick.maxHitPoints)));
  assert.ok(bosses[0].width > Math.max(...minions.map((brick) => brick.width)));
  scene.exit();
});

test('场上方块清空后立即在顶部补充一整排', () => {
  const events = new EventBus();
  const input = { pointer: { active: false, justPressed: false }, pressed() { return false; }, isDown() { return false; } };
  const scene = new BreakoutScene();
  let refill = null;
  events.on('brick:wave-refilled', (payload) => { refill = payload; });
  scene.enter({
    engine: { setPaused() {} }, input, events, ctx: null,
    plugins: { plugins: new Map() },
  });
  scene.startNewGame();
  for (const brick of scene.world.all('brick')) brick.destroy();
  scene.world.flush();
  scene.brickField.update(1 / 120);
  scene.world.flush();

  const bricks = scene.world.all('brick');
  assert.equal(bricks.length, GAME.brick.clearRefillCount);
  assert.equal(refill.bricks.length, GAME.brick.clearRefillCount);
  assert.ok(bricks.every((brick) => brick.y <= GAME.playTop + 14));
  assert.equal(scene.brickField.spawnTimer, GAME.brick.initialSpawnInterval);
  scene.exit();
});

test('强化所需分数随已获得强化次数持续增加', () => {
  const firstCost = calculateUpgradeScoreCost(0);
  const secondCost = calculateUpgradeScoreCost(1);
  const tenthCost = calculateUpgradeScoreCost(9);
  assert.equal(firstCost, GAME.upgrade.scoreInterval);
  assert.ok(secondCost > firstCost);
  assert.ok(tenthCost > secondCost * 2);

  assert.deepEqual(
    calculateUpgradeProgress({ score: firstCost / 2, progressStart: 0, nextScore: firstCost }),
    { earned: firstCost / 2, required: firstCost, ratio: 0.5 },
  );
  assert.deepEqual(
    calculateUpgradeProgress({
      score: firstCost + secondCost / 4,
      progressStart: firstCost,
      nextScore: firstCost + secondCost,
    }),
    { earned: secondCost / 4, required: secondCost, ratio: 0.25 },
  );
});

test('范围伤害跨过强化阈值后，同次多杀仍会完整计分', () => {
  const events = new EventBus();
  const input = { pointer: { active: false, justPressed: false }, pressed() { return false; }, isDown() { return false; } };
  const scene = new BreakoutScene();
  scene.enter({
    engine: { setPaused() {} }, input, events, ctx: null,
    plugins: { plugins: new Map() },
  });
  scene.startNewGame();
  scene.score = GAME.upgrade.scoreInterval - 100;
  const [first, second] = scene.world.all('brick');
  first.hitPoints = 1;
  first.score = 100;
  second.hitPoints = 1;
  second.score = 100;
  const ball = scene.ballFactory.createPrimary({ x: first.x, y: first.y, angle: 0 });

  scene.ballCombat.applyDamage({ ball, brick: first, damage: 1, cause: 'test-area' });
  assert.equal(scene.state, 'upgrading');
  scene.ballCombat.applyDamage({ ball, brick: second, damage: 1, cause: 'test-area' });
  assert.equal(scene.score, GAME.upgrade.scoreInterval + 100);
  scene.exit();
});

test('分数强化可以重复选择并作用于发球和场上球', () => {
  const events = new EventBus();
  const input = { pointer: { active: false, justPressed: false }, pressed() { return false; }, isDown() { return false; } };
  const scene = new BreakoutScene();
  scene.enter({
    engine: { setPaused() {} }, input, events, ctx: null,
    plugins: { plugins: new Map() },
  });
  scene.startNewGame();
  for (let index = 0; index < 40; index += 1) scene.update(1 / 120);

  scene.upgrades.check(scene.upgrades.nextScore);
  assert.equal(scene.state, 'upgrading');
  assert.equal(scene.chooseUpgrade('rapidFire'), true);
  assert.equal(scene.upgrades.levels.rapidFire, 1);
  assert.ok(scene.autoFire.interval < GAME.autoFireInterval);

  scene.upgrades.check(scene.upgrades.nextScore);
  scene.chooseUpgrade('multiShot');
  assert.equal(scene.upgrades.levels.multiShot, 1);
  const existingBalls = scene.world.all('ball');
  const ballCount = existingBalls.length;
  const existingBallIds = new Set(existingBalls.map((candidate) => candidate.id));
  scene.autoFire.random = () => 0;
  scene.autoFire.timeUntilShot = 0;
  scene.update(1 / 120);
  assert.equal(scene.world.all('ball').length, ballCount + 2);
  const newBalls = scene.world.all('ball').filter((candidate) => !existingBallIds.has(candidate.id));
  const automaticLaunch = newBalls.find((candidate) => Math.abs(candidate.velocityX) < .0001);
  const extraLaunch = newBalls.find((candidate) => Math.abs(candidate.velocityX) >= .0001);
  assert.ok(automaticLaunch);
  assert.ok(extraLaunch);
  assert.ok(automaticLaunch.velocityY < 0);
  assert.ok(extraLaunch.velocityY < 0);

  const ball = scene.world.first('ball');
  const speedBefore = Math.hypot(ball.velocityX, ball.velocityY);
  scene.upgrades.check(scene.upgrades.nextScore);
  scene.chooseUpgrade('ballSpeed');
  const speedAfter = Math.hypot(ball.velocityX, ball.velocityY);
  assert.ok(Math.abs(speedAfter / speedBefore - GAME.upgrade.ballSpeedMultiplierPerLevel) < .0001);

  scene.upgrades.check(scene.upgrades.nextScore);
  scene.chooseUpgrade('rapidFire');
  assert.equal(scene.upgrades.levels.rapidFire, 2);
  scene.exit();
});

test('随机强化池只显示三项，有限强化满级后退出候选池', () => {
  const events = new EventBus();
  const input = { pointer: { active: false, justPressed: false }, pressed() { return false; }, isDown() { return false; } };
  const scene = new BreakoutScene();
  scene.enter({
    engine: { setPaused() {} }, input, events, ctx: null,
    plugins: { plugins: new Map() },
  });
  scene.startNewGame();

  const firstOptions = scene.upgrades.options();
  assert.equal(firstOptions.length, 3);
  assert.equal(new Set(firstOptions.map((option) => option.id)).size, 3);

  const chooseDirectly = (id) => {
    scene.upgrades.waitingForChoice = true;
    scene.upgrades.pendingChoices = 1;
    scene.state = 'upgrading';
    assert.equal(scene.chooseUpgrade(id), true);
  };

  for (let level = 0; level < 3; level += 1) chooseDirectly('paddleLength');
  const paddle = scene.world.first('paddle');
  const expectedWidth = GAME.paddle.width * GAME.upgrade.paddleLengthMultiplierPerLevel ** 3;
  assert.ok(Math.abs(paddle.width - expectedWidth) < .0001);
  assert.equal(scene.upgrades.options().some((option) => option.id === 'paddleLength'), false);

  for (let level = 0; level < 3; level += 1) chooseDirectly('bottomBounce');
  assert.ok(Math.abs(scene.upgrades.bottomBounceChance - .6) < .0001);
  assert.equal(scene.upgrades.options().some((option) => option.id === 'bottomBounce'), false);

  for (let index = 0; index < 40; index += 1) scene.update(1 / 120);
  const ball = scene.world.first('ball');
  ball.y = GAME.playBottom + ball.radius + 1;
  ball.velocityY = 100;
  scene.ballPhysics.random = () => .59;
  scene.update(1 / 120);
  assert.equal(ball.active, true);
  assert.ok(ball.velocityY < 0);
  scene.exit();
});

test('连续三秒内击杀形成连击倍率，超时后清零', () => {
  const events = new EventBus();
  const context = { events, engine: { scene: { state: 'playing' } } };
  let ended = 0;
  events.on('combo:ended', () => { ended += 1; });
  ComboPlugin.install(context);

  events.emit('brick:destroyed');
  assert.equal(ComboPlugin.combo, 1);
  assert.equal(ComboPlugin.scoreMultiplier(), 1);
  events.emit('brick:destroyed');
  assert.equal(ComboPlugin.combo, 2);
  assert.ok(Math.abs(ComboPlugin.scoreMultiplier() - 1.1) < .0001);

  ComboPlugin.afterUpdate(2.9, context);
  events.emit('brick:destroyed');
  assert.equal(ComboPlugin.combo, 3);
  assert.ok(Math.abs(ComboPlugin.scoreMultiplier() - 1.2) < .0001);

  ComboPlugin.afterUpdate(3.01, context);
  assert.equal(ComboPlugin.combo, 0);
  assert.equal(ComboPlugin.scoreMultiplier(), 1);
  assert.equal(ended, 1);
  ComboPlugin.dispose();
});
