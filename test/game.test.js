import assert from 'node:assert/strict';
import test from 'node:test';
import { EventBus } from '../src/core/EventBus.js';
import { Entity, World } from '../src/core/Entity.js';
import { GameEngine } from '../src/core/GameEngine.js';
import { InputManager, mapPointerToElement } from '../src/core/InputManager.js';
import { BreakoutScene } from '../src/game/BreakoutScene.js';
import { GAME } from '../src/game/config.js';
import { normalizeDamage, resolveAbilityDamage, scaleDamage } from '../src/game/Damage.js';
import {
  calculateWorldLevelModifiers,
  clampWorldValue,
  normalizeWorldLevel,
} from '../src/game/WorldLevel.js';
import { WorldProgression } from '../src/game/WorldProgression.js';
import { Brick } from '../src/game/entities/entities.js';
import {
  BOSS_SHAPE_IDS,
  BossShapeBag,
  calculateBossRushHealthMultiplier,
  calculateBossEntryMultiplier,
  calculateBrickSizeHealthMultiplier,
  calculateExpectedBrickHitPoints,
  calculateLateGamePressure,
  createBossPolygon,
  getBossArchetype,
  selectBrickDimensions,
  selectBrickHitPoints,
  selectBossPolygon,
} from '../src/game/systems/BrickFieldSystem.js';
import { UpgradeSystem, calculateUpgradeScoreCost } from '../src/game/systems/UpgradeSystem.js';
import { calculateUpgradeProgress, formatWorldLevel } from '../src/ui/GameUI.js';
import {
  COLLECTIBLE_CATALOG,
  COLLECTIBLE_QUALITIES,
  getCollectible,
} from '../src/game/collectibles/CollectibleCatalog.js';
import { CollectibleInventory } from '../src/game/collectibles/CollectibleInventory.js';
import {
  calculateCollectibleRunModifiers,
  createCollectibleRunEffects,
} from '../src/game/collectibles/CollectibleRunEffects.js';
import { PADDLE_SKINS } from '../src/game/paddles/PaddleSkins.js';
import { renderCollectibleIcon } from '../src/ui/CollectibleIcon.js';
import { ComboPlugin } from '../src/game/plugins/ComboPlugin.js';
import {
  BASIC_BALL_ID,
  LIGHTNING_BALL_ID,
  MICRO_NAVIGATION_BALL_ID,
  VOID_ORBIT_BALL_ID,
  createDefaultBallDefinitions,
} from '../src/game/balls/BallDefinitionRegistry.js';
import { BallFactory } from '../src/game/balls/BallFactory.js';
import { getOrbiterPosition, getOrbiterTrail } from '../src/game/balls/Orbiter.js';
import { BallRendererRegistry, getBallLevelVisual } from '../src/game/balls/BallRendererRegistry.js';
import { createDefaultBallEmitters } from '../src/game/emitters/BallEmitterRegistry.js';
import {
  BallFusionRegistry,
  FUSION_BALL_CATALOG,
  FUSION_BALL_IDS,
  composeShotDescriptors,
} from '../src/game/balls/BallFusionRegistry.js';
import { BALL_TRAITS } from '../src/game/balls/BallTraits.js';
import {
  PlayerLeaderboardService,
  detectReleaseChannel,
  normalizeDisplayName,
} from '../src/online/PlayerLeaderboardService.js';

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
  assert.equal(world.count('test', { includePending: true }), 1);
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

test('画布下方触控坐标按画布宽度映射并限制在游戏范围内', () => {
  const canvas = {
    width: 600,
    height: 900,
    getBoundingClientRect() {
      return { left: 10, top: 100, width: 400, height: 600 };
    },
  };
  assert.deepEqual(
    mapPointerToElement({ clientX: 210, clientY: 760 }, canvas),
    { x: 300, y: 900 },
  );
  assert.deepEqual(
    mapPointerToElement({ clientX: -50, clientY: 50 }, canvas),
    { x: 0, y: 0 },
  );
});

test('提示区域支持触摸拖动、指针捕获并在松手后停止控制', () => {
  globalThis.window = { addEventListener() {} };
  const createTarget = (bounds, dimensions = {}) => ({
    ...dimensions,
    listeners: new Map(),
    addEventListener(type, listener) { this.listeners.set(type, listener); },
    getBoundingClientRect() { return bounds; },
    setPointerCapture(pointerId) { this.capturedPointer = pointerId; },
  });
  const canvas = createTarget(
    { left: 20, top: 100, width: 400, height: 600 },
    { width: 600, height: 900 },
  );
  const tip = createTarget({ left: 20, top: 760, width: 400, height: 44 });
  const input = new InputManager({ coordinateElement: canvas, pointerTargets: [canvas, tip] });
  let prevented = 0;
  const touchEvent = (clientX, type = 'touch') => ({
    clientX,
    clientY: 782,
    pointerId: 7,
    pointerType: type,
    preventDefault() { prevented += 1; },
  });

  tip.listeners.get('pointerdown')(touchEvent(120));
  assert.equal(input.pointer.x, 150);
  assert.equal(input.pointer.y, 900);
  assert.equal(input.pointer.active, true);
  assert.equal(input.pointer.justPressed, true);
  assert.equal(tip.capturedPointer, 7);

  tip.listeners.get('pointermove')(touchEvent(360));
  assert.equal(input.pointer.x, 510);
  assert.equal(prevented, 2);

  tip.listeners.get('pointermove')(touchEvent(220, 'mouse'));
  assert.equal(input.pointer.x, 510);
  tip.listeners.get('pointerup')();
  assert.equal(input.pointer.active, false);
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
  while (brick.active) {
    scene.ballCombat.applyDamage({ ball, brick, damage: GAME.combat.baseDamage, cause: 'test' });
  }
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

test('玩家可以主动结算当前对局，并只产生一次可上传的结束结果', () => {
  const events = new EventBus();
  const settled = [];
  const finished = [];
  const lost = [];
  events.on('game:settled', (result) => settled.push(result));
  events.on('game:finished', (result) => finished.push(result));
  events.on('game:lost', (result) => lost.push(result));
  const engine = { paused: true, setPaused(value) { this.paused = value; } };
  const scene = new BreakoutScene();
  scene.enter({
    engine,
    input: { pointer: {}, pressed() { return false; }, isDown() { return false; } },
    events,
    ctx: null,
    plugins: { plugins: new Map() },
  });
  scene.startNewGame();
  scene.score = 240000000;
  scene.brickField.elapsed = 1234.5;

  const result = scene.settleRun();
  assert.equal(scene.state, 'settled');
  assert.equal(engine.paused, false);
  assert.equal(result.score, 240000000);
  assert.equal(result.elapsed, 1234.5);
  assert.equal(result.reason, 'manual-settlement');
  assert.equal(settled.length, 1);
  assert.equal(finished.length, 1);
  assert.equal(lost.length, 0);
  assert.equal(scene.settleRun(), null);
  assert.equal(finished.length, 1);
  scene.exit();
});

test('所有实际伤害统一为非负整数', () => {
  assert.equal(normalizeDamage(16.5), 17);
  assert.equal(normalizeDamage(-3.2), 0);
  assert.equal(normalizeDamage(Number.NaN), 0);
  assert.equal(scaleDamage(11, 1.5), 17);

  const events = new EventBus();
  const scene = new BreakoutScene();
  scene.enter({
    engine: { setPaused() {} },
    input: { pointer: {}, pressed() { return false; }, isDown() { return false; } },
    events,
    ctx: null,
    plugins: { plugins: new Map() },
  });
  scene.startNewGame();
  const ball = scene.ballFactory.createPrimary({ x: 100, y: 100, angle: 0 });
  const brick = scene.world.first('brick');
  brick.hitPoints = 100;
  const result = scene.ballCombat.applyDamage({ ball, brick, damage: 16.5 });
  assert.equal(result.damage, 17);
  assert.equal(brick.hitPoints, 83);
  assert.equal(Number.isInteger(brick.hitPoints), true);
  scene.exit();
});

test('玩家名称允许重复但会规范空白并限制长度，正式版与 Beta 可分榜', () => {
  assert.equal(normalizeDisplayName('  同名  玩家  '), '同名 玩家');
  assert.throws(() => normalizeDisplayName('   '), /请输入玩家名称/);
  assert.throws(() => normalizeDisplayName('一二三四五六七八九十一二三四五六七'), /最多 16 个字符/);
  assert.equal(detectReleaseChannel({ pathname: '/brocube/', search: '' }), 'stable');
  assert.equal(detectReleaseChannel({ pathname: '/brocube/beta/', search: '' }), 'beta');
  assert.equal(detectReleaseChannel({ pathname: '/', search: '?channel=beta' }), 'beta');
  assert.equal(detectReleaseChannel(
    { pathname: '/', search: '' },
    { documentElement: { dataset: { releaseChannel: 'beta' } } },
  ), 'beta');
});

test('未配置在线服务时仍建立稳定本机身份，并只保留当前玩家最高分', async () => {
  const values = new Map();
  const storage = {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, value); },
    removeItem(key) { values.delete(key); },
  };
  const config = {
    supabaseUrl: '',
    supabasePublishableKey: '',
    leaderboardLimit: 20,
    gameVersion: 'test-v1',
  };
  const service = new PlayerLeaderboardService({
    config,
    storage,
    location: { pathname: '/beta/', search: '' },
  });
  const initial = await service.initialize();
  assert.equal(initial.mode, 'local');
  assert.equal(initial.channel, 'beta');
  assert.equal(initial.needsName, true);
  assert.ok(initial.playerId);

  const named = await service.setDisplayName('测试玩家');
  assert.equal(named.displayName, '测试玩家');
  await service.submitRun({ score: 1200, elapsed: 12.345, upgrades: { rapidFire: 1 }, worldLevel: 7 });
  await service.submitRun({ score: 900, elapsed: 20, upgrades: {} });
  const leaderboard = await service.getLeaderboard();
  assert.equal(leaderboard.length, 1);
  assert.equal(leaderboard[0].score, 1200);
  assert.equal(leaderboard[0].duration_seconds, 12.35);
  assert.equal(leaderboard[0].world_level, 7);

  const restored = new PlayerLeaderboardService({ config, storage });
  const restoredState = await restored.initialize();
  assert.equal(restoredState.playerId, named.playerId);
  assert.equal(restoredState.displayName, '测试玩家');
});

test('Supabase REST 接入可创建匿名用户、保存可重名昵称、提交成绩并读取榜单', async () => {
  const values = new Map();
  const storage = {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, value); },
    removeItem(key) { values.delete(key); },
  };
  const requests = [];
  const userId = '11111111-1111-4111-8111-111111111111';
  const responses = [
    { access_token: 'access', refresh_token: 'refresh', expires_in: 3600, user: { id: userId } },
    [],
    [{ user_id: userId, display_name: '同名玩家' }],
    null,
    [{ rank: 1, player_code: 'AB12', display_name: '同名玩家', score: 3210, world_level: 12, is_current: true }],
  ];
  const fetcher = async (url, options) => {
    requests.push({ url, options });
    const payload = responses.shift();
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  const service = new PlayerLeaderboardService({
    config: {
      supabaseUrl: 'https://example.supabase.co',
      supabasePublishableKey: 'sb_publishable_test',
      leaderboardLimit: 20,
      gameVersion: 'test-v1',
    },
    storage,
    fetcher,
    location: { pathname: '/', search: '' },
  });

  assert.equal((await service.initialize()).mode, 'online');
  await service.setDisplayName('同名玩家');
  await service.submitRun({ score: 3210, elapsed: 40, upgrades: {}, worldLevel: 12 });
  const leaderboard = await service.getLeaderboard();
  assert.equal(leaderboard[0].is_current, true);
  assert.match(requests[0].url, /\/auth\/v1\/signup$/);
  assert.deepEqual(JSON.parse(requests[0].options.body), { data: {}, gotrue_meta_security: {} });
  assert.ok(requests.slice(1).every(({ options }) => options.headers.Authorization === 'Bearer access'));
  const runRequest = requests.find(({ url }) => url.endsWith('/rest/v1/game_runs'));
  assert.equal(runRequest.options.headers.Prefer, 'return=minimal');
  assert.equal(JSON.parse(runRequest.options.body).world_level, 12);
  assert.match(requests.at(-1).url, /\/rest\/v1\/rpc\/get_leaderboard$/);
});

test('球触底扣除一点生命，生命耗尽后才消失', () => {
  const events = new EventBus();
  const lifeLosses = [];
  const saves = [];
  const losses = [];
  events.on('ball:life-lost', (payload) => lifeLosses.push(payload));
  events.on('ball:saved', (payload) => saves.push(payload));
  events.on('ball:lost', (payload) => losses.push(payload));
  const scene = new BreakoutScene();
  scene.enter({
    engine: { setPaused() {} },
    input: { pointer: {}, pressed() { return false; }, isDown() { return false; } },
    events,
    ctx: null,
    plugins: { plugins: new Map() },
  });
  scene.startNewGame();
  scene.ballPhysics.random = () => 1;

  const ball = scene.ballFactory.createPrimary({
    x: GAME.width / 2,
    y: GAME.playBottom + GAME.ball.radius + 1,
    angle: Math.PI / 2,
    lives: 2,
  });
  scene.world.add(ball);
  scene.world.flush();

  scene.ballPhysics.update(0);
  assert.equal(ball.lives, 1);
  assert.equal(ball.active, true);
  assert.ok(ball.velocityY < 0);
  assert.equal(lifeLosses.length, 1);
  assert.equal(saves[0].reason, 'remaining-lives');
  assert.equal(losses.length, 0);

  ball.y = GAME.playBottom + ball.radius + 1;
  ball.velocityY = Math.abs(ball.velocityY);
  scene.ballPhysics.update(0);
  assert.equal(ball.lives, 0);
  assert.equal(ball.active, false);
  assert.equal(lifeLosses.length, 2);
  assert.equal(losses.length, 1);
  assert.equal(losses[0].lives, 0);
  scene.exit();
});

test('生命增幅只强化新生成的球，最多可选择两级', () => {
  const events = new EventBus();
  const launches = [];
  events.on('ball:launched', ({ ball }) => launches.push(ball));
  const scene = new BreakoutScene();
  scene.enter({
    engine: { setPaused() {} },
    input: { pointer: {}, pressed() { return false; }, isDown() { return false; } },
    events,
    ctx: null,
    plugins: { plugins: new Map() },
  });
  scene.startNewGame();
  const existingBall = scene.ballFactory.createPrimary({ x: 100, y: 400, angle: 0 });
  scene.world.add(existingBall);
  scene.world.flush();
  scene.autoFire.random = () => .99;

  for (let level = 1; level <= GAME.upgrade.ballLivesMaxLevel; level += 1) {
    scene.upgrades.waitingForChoice = true;
    scene.upgrades.pendingChoices = 1;
    scene.state = 'upgrading';
    assert.equal(scene.chooseUpgrade('ballLives'), true);
    assert.equal(existingBall.lives, GAME.ball.defaultLives);
    assert.equal(
      scene.upgrades.newBallLives,
      GAME.ball.defaultLives + GAME.upgrade.ballLivesPerLevel * level,
    );

    scene.autoFire.timeUntilShot = 0;
    scene.update(1 / 120);
    assert.equal(launches.at(-1).lives, scene.upgrades.newBallLives);
  }

  assert.equal(scene.upgrades.isAvailable('ballLives'), false);
  assert.equal(scene.upgrades.options().some(({ id }) => id === 'ballLives'), false);
  scene.exit();
});

test('攻击强化提升球基础伤害，并同步强化所有特殊球衍生伤害', () => {
  const events = new EventBus();
  const launches = [];
  events.on('ball:launched', ({ ball }) => launches.push(ball));
  const scene = new BreakoutScene();
  scene.enter({
    engine: { setPaused() {} },
    input: { pointer: {}, pressed() { return false; }, isDown() { return false; } },
    events,
    ctx: null,
    plugins: { plugins: new Map() },
  });
  scene.startNewGame();

  const directBall = scene.ballFactory.createPrimary({ x: 100, y: 400, angle: 0 });
  const lightningBall = scene.ballFactory.createPrimary({
    definitionId: LIGHTNING_BALL_ID,
    x: 200,
    y: 400,
    angle: 0,
  });
  const blastBall = scene.ballFactory.createPrimary({
    x: 300,
    y: 400,
    angle: 0,
    periodicEffects: [{
      id: 'area-blast',
      interval: 1,
      config: { damage: GAME.upgrade.blastDamage },
    }],
  });
  const voidBall = scene.ballFactory.createPrimary({
    definitionId: VOID_ORBIT_BALL_ID,
    x: 400,
    y: 400,
    angle: 0,
  });
  scene.world.add(directBall);
  scene.world.add(lightningBall);
  scene.world.add(blastBall);
  scene.world.add(voidBall);
  scene.world.flush();

  const chooseDirectly = () => {
    scene.upgrades.waitingForChoice = true;
    scene.upgrades.pendingChoices = 1;
    scene.state = 'upgrading';
    assert.equal(scene.chooseUpgrade('ballDamage'), true);
  };
  chooseDirectly();
  assert.equal(directBall.damage, GAME.combat.baseDamage + 1);
  assert.equal(blastBall.damage, GAME.combat.baseDamage + 1);
  assert.equal(blastBall.periodicEffects[0].config.damage, GAME.upgrade.blastDamage);
  assert.equal(lightningBall.damage, 0);
  assert.equal(lightningBall.baseDamage, GAME.combat.baseDamage + 1);
  assert.equal(voidBall.baseDamage, GAME.combat.baseDamage + 1);
  assert.equal(resolveAbilityDamage(
    blastBall,
    { ...blastBall.periodicEffects[0].config, baseDamageScale: 1 },
  ), GAME.combat.baseDamage + 1);
  assert.equal(resolveAbilityDamage(
    lightningBall,
    lightningBall.damageEffects[0].config,
  ), GAME.combat.baseDamage + 1);
  assert.equal(resolveAbilityDamage(
    voidBall,
    voidBall.orbiters[0],
  ), GAME.combat.baseDamage + 1);

  scene.autoFire.random = () => .99;
  scene.autoFire.timeUntilShot = 0;
  scene.update(1 / 120);
  assert.equal(launches.at(-1).damage, GAME.combat.baseDamage + 1);

  scene.upgrades.random = () => .99;
  assert.equal(scene.upgrades.options().some(({ id }) => id === 'ballDamage'), false);
  scene.upgrades.random = () => 0;
  assert.equal(scene.upgrades.options().some(({ id }) => id === 'ballDamage'), true);

  for (let level = 1; level < GAME.upgrade.ballDamageMaxLevel; level += 1) chooseDirectly();
  assert.equal(scene.upgrades.levels.ballDamage, GAME.upgrade.ballDamageMaxLevel);
  assert.equal(scene.upgrades.ballDamageBonus, GAME.upgrade.ballDamageMaxLevel);
  assert.equal(directBall.damage, GAME.combat.baseDamage + GAME.upgrade.ballDamageMaxLevel);
  assert.equal(lightningBall.baseDamage, GAME.combat.baseDamage + GAME.upgrade.ballDamageMaxLevel);
  assert.equal(resolveAbilityDamage(
    lightningBall,
    lightningBall.damageEffects[0].config,
  ), GAME.combat.baseDamage + GAME.upgrade.ballDamageMaxLevel);
  assert.equal(scene.upgrades.isAvailable('ballDamage'), false);
  assert.equal(scene.upgrades.options().some(({ id }) => id === 'ballDamage'), false);
  scene.exit();
});

test('主球与衍生球独立升级，特殊球同步获得各自的等级能力', () => {
  const events = new EventBus();
  const levelUps = [];
  events.on('ball:leveled', (payload) => levelUps.push(payload));
  const scene = new BreakoutScene();
  scene.enter({
    engine: { setPaused() {} },
    input: { pointer: {}, pressed() { return false; }, isDown() { return false; } },
    events,
    ctx: null,
    plugins: { plugins: new Map() },
  });
  scene.startNewGame();

  const killBrick = (ball, cause = 'test-kill') => {
    const brick = new Brick({
      x: 0,
      y: 0,
      width: 20,
      height: 20,
      hitPoints: GAME.combat.baseHealth,
      score: 0,
    });
    scene.ballCombat.applyDamage({
      ball,
      brick,
      damage: GAME.combat.baseHealth,
      cause,
    });
  };

  const primary = scene.ballFactory.createPrimary({ x: 100, y: 400, angle: 0 });
  for (let count = 0; count < 2; count += 1) killBrick(primary);
  assert.equal(primary.level, 1);
  assert.equal(primary.kills, 2);
  assert.equal(primary.damage, GAME.combat.baseDamage);
  assert.equal(primary.lives, GAME.ball.defaultLives);

  killBrick(primary);
  assert.equal(primary.level, 2);
  assert.equal(primary.levelUpAt, primary.age);
  assert.equal(primary.damage, GAME.combat.baseDamage + GAME.ball.levelDamageBonus);
  assert.equal(primary.lives, GAME.ball.defaultLives);

  for (let count = 3; count < 9; count += 1) killBrick(primary);
  assert.equal(primary.level, 3);
  assert.equal(primary.kills, 9);
  assert.equal(primary.damage, GAME.combat.baseDamage + GAME.ball.levelDamageBonus * 2);
  assert.equal(primary.lives, GAME.ball.defaultLives + GAME.ball.levelLivesBonus);

  const derived = scene.ballFactory.createDerived({ x: 200, y: 400, angle: 0 });
  for (let count = 0; count < 3; count += 1) killBrick(derived);
  assert.equal(derived.level, 2);
  assert.equal(derived.damage, GAME.combat.baseDamage + GAME.ball.levelDamageBonus);
  assert.equal(derived.lives, GAME.ball.defaultLives);

  const lightning = scene.ballFactory.createPrimary({
    definitionId: LIGHTNING_BALL_ID,
    x: 300,
    y: 400,
    angle: 0,
  });
  const chainDamage = resolveAbilityDamage(lightning, lightning.damageEffects[0].config);
  for (let count = 0; count < 3; count += 1) killBrick(lightning, 'chain-lightning');
  assert.equal(lightning.level, 2);
  assert.equal(lightning.damage, 0);
  assert.equal(
    resolveAbilityDamage(lightning, lightning.damageEffects[0].config),
    chainDamage + GAME.ball.levelDamageBonus + GAME.ball.levelLightningDamageBonus,
  );
  assert.equal(
    lightning.damageEffects[0].config.additionalTargets,
    GAME.upgrade.lightningAdditionalTargets + GAME.ball.levelLightningTargetBonus,
  );
  assert.equal(lightning.lives, GAME.ball.defaultLives);
  for (let count = 3; count < 9; count += 1) killBrick(lightning, 'chain-lightning');
  assert.equal(lightning.level, 3);
  assert.equal(
    resolveAbilityDamage(lightning, lightning.damageEffects[0].config),
    chainDamage + (GAME.ball.levelDamageBonus + GAME.ball.levelLightningDamageBonus) * 2,
  );
  assert.equal(
    lightning.damageEffects[0].config.additionalTargets,
    GAME.upgrade.lightningAdditionalTargets + GAME.ball.levelLightningTargetBonus * 2,
  );
  assert.equal(lightning.lives, GAME.ball.defaultLives + GAME.ball.levelLivesBonus);

  const blast = scene.ballFactory.createPrimary({
    x: 400,
    y: 400,
    angle: 0,
    periodicEffects: [{
      id: 'area-blast',
      interval: 1,
      config: { damage: GAME.upgrade.blastDamage, radius: GAME.upgrade.blastRadius },
    }],
  });
  for (let count = 0; count < 3; count += 1) killBrick(blast, 'periodic-explosion');
  assert.equal(blast.level, 2);
  assert.equal(blast.damage, GAME.combat.baseDamage + GAME.ball.levelDamageBonus);
  assert.equal(
    resolveAbilityDamage(blast, {
      ...blast.periodicEffects[0].config,
      baseDamageScale: 1,
    }),
    GAME.upgrade.blastDamage + GAME.ball.levelDamageBonus + GAME.ball.levelBlastDamageBonus,
  );
  assert.equal(
    blast.periodicEffects[0].config.radius,
    GAME.upgrade.blastRadius + GAME.ball.levelBlastRadiusBonus,
  );
  for (let count = 3; count < 9; count += 1) killBrick(blast, 'periodic-explosion');
  assert.equal(blast.level, 3);
  assert.equal(
    resolveAbilityDamage(blast, {
      ...blast.periodicEffects[0].config,
      baseDamageScale: 1,
    }),
    GAME.upgrade.blastDamage
      + (GAME.ball.levelDamageBonus + GAME.ball.levelBlastDamageBonus) * 2,
  );
  assert.equal(
    blast.periodicEffects[0].config.radius,
    GAME.upgrade.blastRadius + GAME.ball.levelBlastRadiusBonus * 2,
  );

  const voidBall = scene.ballFactory.createPrimary({
    definitionId: VOID_ORBIT_BALL_ID,
    x: 500,
    y: 400,
    angle: 0,
  });
  const orbiterDamage = voidBall.orbiters[0].damage;
  for (let count = 0; count < 3; count += 1) killBrick(voidBall, 'orbiting-satellite');
  assert.equal(voidBall.level, 2);
  assert.equal(voidBall.orbiters.length, 3);
  assert.ok(voidBall.orbiters.every(({ damage }) => damage === orbiterDamage));
  assert.equal(
    resolveAbilityDamage(voidBall, voidBall.orbiters[0]),
    GAME.upgrade.voidOrbiterDamage + GAME.ball.levelDamageBonus,
  );
  for (let count = 3; count < 9; count += 1) killBrick(voidBall, 'orbiting-satellite');
  assert.equal(voidBall.level, 3);
  assert.equal(voidBall.orbiters.length, 4);
  assert.ok(voidBall.orbiters.every(({ brickContacts }) => brickContacts instanceof Set));
  for (let index = 1; index < voidBall.orbiters.length; index += 1) {
    assert.ok(Math.abs(
      voidBall.orbiters[index].phase - voidBall.orbiters[index - 1].phase
        - Math.PI * 2 / voidBall.orbiters.length,
    ) < .0001);
  }

  assert.equal(levelUps.filter(({ ball }) => ball === primary).length, 2);
  assert.equal(levelUps.filter(({ ball }) => ball === derived).length, 1);
  assert.equal(levelUps.filter(({ ball }) => ball === lightning).length, 2);
  assert.equal(levelUps.filter(({ ball }) => ball === blast).length, 2);
  assert.equal(levelUps.filter(({ ball }) => ball === voidBall).length, 2);
  assert.deepEqual(
    levelUps.filter(({ ball }) => ball === primary).map(({ livesBonus }) => livesBonus),
    [0, GAME.ball.levelLivesBonus],
  );
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

  const primary = factory.createPrimary({
    definitionId: 'storm-piercer',
    x: 20,
    y: 30,
    angle: 0,
    level: 3,
    lives: 2,
  });
  assert.equal(primary.definitionId, 'storm-piercer');
  assert.equal(primary.role, 'primary');
  assert.equal(primary.damage, 4);
  assert.equal(primary.level, 3);
  assert.equal(primary.lives, 2);
  assert.equal(primary.damageType, 'electric');
  assert.deepEqual(primary.damageEffects, [{ id: 'chain-lightning', config: {} }]);
  assert.equal(primary.collisionPolicy, 'pierce');
  assert.equal(primary.collisionState.remainingPierces, 3);
  assert.equal(primary.periodicEffects[0].id, 'energy-pulse');
  assert.equal(primary.periodicEffects[0].timeRemaining, 2);

  const derived = factory.createDerived({ x: 20, y: 30, angle: 0, level: 2, lives: 4 });
  assert.equal(derived.definitionId, BASIC_BALL_ID);
  assert.equal(derived.role, 'derived');
  assert.equal(derived.radius, GAME.ball.derivedRadius);
  assert.equal(derived.damage, GAME.combat.baseDamage);
  assert.equal(derived.level, 2);
  assert.equal(derived.lives, 4);
  assert.equal(derived.damageType, 'kinetic');
  assert.deepEqual(derived.damageEffects, []);
  assert.deepEqual(derived.periodicEffects, []);
  assert.equal(derived.collisionPolicy, 'bounce');
  assert.deepEqual(derived.collisionConfig, {});
  assert.deepEqual(derived.orbiters, []);
});

test('战斗数值统一放大十倍，球默认具备等级和生命属性', () => {
  const definitions = createDefaultBallDefinitions();
  const factory = new BallFactory(definitions);
  const basic = factory.createPrimary({ x: 20, y: 30, angle: 0 });

  assert.equal(GAME.combat.valueScale, 10);
  assert.equal(GAME.combat.baseDamage, 10);
  assert.equal(GAME.combat.baseHealth, 10);
  assert.equal(definitions.get(BASIC_BALL_ID).damage, 10);
  assert.equal(definitions.get(MICRO_NAVIGATION_BALL_ID).damage, 10);
  assert.equal(definitions.get(VOID_ORBIT_BALL_ID).orbitingDamage.damage, 10);
  assert.equal(
    definitions.get(LIGHTNING_BALL_ID).damageEffects[0].config.damage,
    10,
  );
  assert.equal(GAME.upgrade.blastDamage, 10);
  assert.equal(basic.level, GAME.ball.defaultLevel);
  assert.equal(basic.lives, GAME.ball.defaultLives);
});

test('不同球等级使用轻量且明确区分的外观层级', () => {
  assert.equal(getBallLevelVisual(1), null);
  assert.deepEqual(getBallLevelVisual(2), {
    color: '#65f6ff',
    ringCount: 1,
    nodeCount: 2,
    rotationSpeed: 2.6,
  });
  assert.deepEqual(getBallLevelVisual(3), {
    color: '#ffd166',
    ringCount: 2,
    nodeCount: 3,
    rotationSpeed: 3.8,
  });
});

test('球视觉层会按底层、主体、上层顺序叠加', () => {
  const order = [];
  const renderers = new BallRendererRegistry()
    .register('orb', () => order.push('body'))
    .registerLayer('aura', () => order.push('underlay'))
    .registerLayer('nodes', () => order.push('overlay'));
  renderers.render({}, {
    level: 1,
    visual: {
      renderer: 'orb',
      layers: [
        { id: 'aura', phase: 'underlay' },
        'nodes',
      ],
    },
  });
  assert.deepEqual(order, ['underlay', 'body', 'overlay']);
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

test('融合配方可组合发射、能力、数值、特征与视觉层', () => {
  const top = {
    componentId: 'top-launch',
    emitterId: 'top',
    speedMultiplier: 2,
    traits: [BALL_TRAITS.TOP_LAUNCH],
    visualLayers: ['top-aura'],
    damageEffects: [{ id: 'pulse', config: { damage: 10 } }],
  };
  const voidOrbit = {
    componentId: 'void-orbit',
    definitionId: VOID_ORBIT_BALL_ID,
    speedMultiplier: 1.25,
    damageMultiplier: 1.5,
    traits: [BALL_TRAITS.VOID_ORBIT],
    visualLayers: ['void-satellites'],
    damageEffects: [{ id: 'pulse', config: { radius: 80 } }],
  };
  const composed = composeShotDescriptors([top, voidOrbit], {
    emitterId: 'top',
    speedMultiplier: 1.2,
    visualLayers: ['fusion-flare'],
  });
  assert.equal(composed.emitterId, 'top');
  assert.equal(composed.definitionId, VOID_ORBIT_BALL_ID);
  assert.equal(composed.speedMultiplier, 3);
  assert.equal(composed.damageMultiplier, 1.5);
  assert.deepEqual(
    composed.traits,
    [BALL_TRAITS.TOP_LAUNCH, BALL_TRAITS.VOID_ORBIT],
  );
  assert.deepEqual(composed.visualLayers, ['top-aura', 'void-satellites', 'fusion-flare']);
  assert.deepEqual(composed.damageEffects, [{
    id: 'pulse',
    config: { damage: 10, radius: 80 },
  }]);

  const fusions = new BallFusionRegistry().register('top-void', {
    componentIds: ['top-launch', 'void-orbit'],
    overrides: { emitterId: 'top', randomized: true },
  });
  assert.equal(fusions.availableShots([top], {}).length, 0);
  const fusionShot = fusions.availableShots([top, voidOrbit], {})[0];
  assert.equal(fusionShot.shotType, 'top-void');
  assert.equal(fusionShot.source, 'fusion:top-void');
  assert.deepEqual(fusionShot.fusionComponents, ['top-launch', 'void-orbit']);
});

test('十种默认融合球内容完整注册，但不会在融合操作确定前进入自动发射池', () => {
  const events = new EventBus();
  const scene = new BreakoutScene();
  scene.enter({
    engine: { setPaused() {} },
    input: { pointer: {}, pressed() { return false; }, isDown() { return false; } },
    events,
    ctx: null,
    plugins: { plugins: new Map() },
  });
  scene.startNewGame();
  Object.assign(scene.upgrades.levels, {
    topLaunch: 1,
    blastLaunch: 1,
    voidOrbit: 1,
    microNavigation: 1,
    lightning: 1,
  });
  const components = scene.autoFire.availablePrimaryShots();
  assert.equal(components.some(({ fusionId }) => fusionId), false);
  assert.equal(scene.ballFusions.all().length, 10);
  assert.deepEqual(
    scene.ballFusions.all().map(({ metadata }) => metadata.name),
    FUSION_BALL_CATALOG.map(({ name }) => name),
  );
  for (const entry of FUSION_BALL_CATALOG) {
    const recipe = scene.ballFusions.get(entry.id);
    const shot = scene.ballFusions.createShot(entry.id, components, { scene });
    assert.equal(recipe.includeInAutomaticPool, false);
    assert.equal(recipe.metadata.contentReady, true);
    assert.equal(recipe.metadata.acquisitionPending, true);
    assert.ok(shot, `${entry.name} 应能生成发射描述`);
    assert.equal(shot.fusionId, entry.id);
    assert.deepEqual(shot.fusionComponents, entry.components);
    assert.ok(shot.visualLayers.some(({ id }) => id === 'fusion-signature'));
  }
  scene.exit();
});

test('虚空系融合将另一种特殊球做成子球载荷，核心不重复触发其伤害能力', () => {
  const scene = new BreakoutScene();
  scene.enter({
    engine: { setPaused() {} },
    input: { pointer: {}, pressed() { return false; }, isDown() { return false; } },
    events: new EventBus(),
    ctx: null,
    plugins: { plugins: new Map() },
  });
  scene.startNewGame();
  Object.assign(scene.upgrades.levels, {
    topLaunch: 1,
    blastLaunch: 1,
    voidOrbit: 1,
    microNavigation: 1,
    lightning: 1,
  });
  const components = scene.autoFire.availablePrimaryShots();
  const expectedPayloads = new Map([
    [FUSION_BALL_IDS.TOP_VOID, 'zenith'],
    [FUSION_BALL_IDS.BLAST_VOID, 'blast'],
    [FUSION_BALL_IDS.VOID_NAVIGATION, 'navigation'],
    [FUSION_BALL_IDS.VOID_LIGHTNING, 'lightning'],
  ]);

  for (const [fusionId, payloadType] of expectedPayloads) {
    const shot = scene.ballFusions.createShot(fusionId, components, { scene });
    const ball = scene.ballFactory.createPrimary({
      ...shot,
      x: 300,
      y: 300,
      angle: -Math.PI / 2,
      speed: GAME.ball.speed,
    });
    assert.equal(ball.definitionId, VOID_ORBIT_BALL_ID);
    assert.equal(ball.contactDamage, false);
    assert.equal(ball.damageEffects.length, 0);
    assert.equal(ball.periodicEffects.length, 0);
    assert.equal(ball.guidance, null);
    assert.equal(ball.orbiters.length, 2);
    assert.ok(ball.orbiters.every(({ payload }) => payload?.type === payloadType));
    assert.notEqual(ball.orbiters[0].payload, ball.orbiters[1].payload);
    if (payloadType === 'blast') {
      assert.ok(ball.orbiters.every(({ payload }) => payload.periodicEffects[0].id === 'area-blast'));
      assert.notEqual(
        ball.orbiters[0].payload.periodicEffects[0].timeRemaining,
        ball.orbiters[1].payload.periodicEffects[0].timeRemaining,
      );
    } else if (payloadType === 'navigation') {
      assert.ok(ball.orbiters.every(({ payload }) => payload.guidance));
    } else if (payloadType === 'lightning') {
      assert.ok(ball.orbiters.every(({ payload }) => (
        payload.contactDamage === false
        && payload.damageEffects[0].id === 'chain-lightning'
      )));
    }
  }
  scene.exit();
});

test('虚空爆裂在子球位置错峰爆炸，虚空导航子球可脱离轨道突进', () => {
  const events = new EventBus();
  const explosions = [];
  events.on('ball:exploded', (payload) => explosions.push(payload));
  const scene = new BreakoutScene();
  scene.enter({
    engine: { setPaused() {} },
    input: { pointer: {}, pressed() { return false; }, isDown() { return false; } },
    events,
    ctx: null,
    plugins: { plugins: new Map() },
  });
  scene.startNewGame();
  Object.assign(scene.upgrades.levels, {
    blastLaunch: 1,
    voidOrbit: 1,
    microNavigation: 1,
  });
  const components = scene.autoFire.availablePrimaryShots();
  const createFusionBall = (fusionId) => {
    const shot = scene.ballFusions.createShot(fusionId, components, { scene });
    return scene.ballFactory.createPrimary({
      ...shot,
      x: 300,
      y: 300,
      angle: -Math.PI / 2,
      speed: GAME.ball.speed,
    });
  };

  const blast = createFusionBall(FUSION_BALL_IDS.BLAST_VOID);
  scene.world.clear();
  scene.world.add(blast);
  scene.world.flush();
  const blastOrigin = getOrbiterPosition(blast, blast.orbiters[0]);
  blast.orbiters[0].payload.periodicEffects[0].timeRemaining = 0;
  blast.orbiters[1].payload.periodicEffects[0].timeRemaining = 10;
  scene.ballAbilities.update(0);
  assert.equal(explosions.length, 1);
  assert.equal(explosions[0].orbiter, blast.orbiters[0]);
  assert.ok(
    Math.abs(explosions[0].x - blastOrigin.x) < .0001,
    `爆炸横坐标 ${explosions[0].x} 应位于子球 ${blastOrigin.x}`,
  );
  assert.ok(
    Math.abs(explosions[0].y - blastOrigin.y) < .0001,
    `爆炸纵坐标 ${explosions[0].y} 应位于子球 ${blastOrigin.y}`,
  );

  const navigation = createFusionBall(FUSION_BALL_IDS.VOID_NAVIGATION);
  const natural = getOrbiterPosition(navigation, navigation.orbiters[0]);
  const target = new Brick({
    x: natural.x + 70,
    y: natural.y - 10,
    width: 24,
    height: 24,
    hitPoints: 999,
  });
  scene.world.add(navigation);
  scene.world.add(target);
  scene.world.flush();
  scene.orbiterDamage.update(.1);
  const lunging = getOrbiterPosition(navigation, navigation.orbiters[0]);
  assert.ok(lunging.x > natural.x);
  assert.ok(navigation.orbiters[0].payload.guidance.lunge);
  scene.exit();
});

test('虚空融合子球继承双方衍生强化，并随核心等级一起成长', () => {
  const scene = new BreakoutScene();
  scene.enter({
    engine: { setPaused() {} },
    input: { pointer: {}, pressed() { return false; }, isDown() { return false; } },
    events: new EventBus(),
    ctx: null,
    plugins: { plugins: new Map() },
  });
  scene.startNewGame();
  Object.assign(scene.upgrades.levels, {
    topLaunch: 1,
    blastLaunch: 1,
    voidOrbit: 1,
    microNavigation: 1,
    lightning: 1,
  });
  const components = scene.autoFire.availablePrimaryShots();
  const createFusionBall = (fusionId) => {
    const shot = scene.ballFusions.createShot(fusionId, components, { scene });
    const ball = scene.ballFactory.createPrimary({
      ...shot,
      x: 300,
      y: 300,
      angle: -Math.PI / 2,
      speed: GAME.ball.speed,
    });
    scene.world.add(ball);
    return ball;
  };
  const zenith = createFusionBall(FUSION_BALL_IDS.TOP_VOID);
  const zenithLightning = createFusionBall(FUSION_BALL_IDS.TOP_LIGHTNING);
  const blast = createFusionBall(FUSION_BALL_IDS.BLAST_VOID);
  const navigation = createFusionBall(FUSION_BALL_IDS.VOID_NAVIGATION);
  const lightning = createFusionBall(FUSION_BALL_IDS.VOID_LIGHTNING);
  scene.world.flush();
  const chooseDirectly = (id) => {
    scene.upgrades.waitingForChoice = true;
    scene.upgrades.pendingChoices = 1;
    scene.state = 'upgrading';
    assert.equal(scene.chooseUpgrade(id), true);
  };

  chooseDirectly('topImpact');
  assert.ok(zenith.orbiters.every(({ payload }) => (
    payload.damageMultiplier === scene.upgrades.topImpactDamageMultiplier
  )));
  assert.equal(
    zenithLightning.damageEffects[0].config.damageMultiplier,
    scene.upgrades.topImpactDamageMultiplier,
  );
  chooseDirectly('blastCooldown');
  assert.ok(blast.orbiters.every(({ payload }) => (
    payload.periodicEffects[0].interval === scene.upgrades.blastInterval
  )));
  chooseDirectly('blastImpact');
  assert.ok(blast.orbiters.every(({ payload }) => (
    payload.damageEffects.some(({ id }) => id === 'impact-blast')
  )));
  chooseDirectly('navigationStrength');
  chooseDirectly('navigationReturn');
  assert.ok(navigation.orbiters.every(({ payload }) => (
    payload.guidance.strength === scene.upgrades.navigationStrength
    && payload.guidance.returnStrikeChance === scene.upgrades.navigationReturnChance
  )));
  chooseDirectly('lightningJumps');
  chooseDirectly('lightningStrike');
  const lightningEffect = lightning.orbiters[0].payload.damageEffects[0];
  assert.equal(lightningEffect.config.additionalTargets, scene.upgrades.lightningAdditionalTargets);
  assert.equal(lightningEffect.config.strikeChance, scene.upgrades.lightningStrikeChance);

  for (let index = 0; index < GAME.ball.levelKillThresholds[0]; index += 1) {
    const brick = new Brick({ x: 0, y: 0, width: 20, height: 20, hitPoints: 1 });
    scene.ballCombat.applyDamage({ ball: lightning, brick, damage: 1 });
  }
  assert.equal(lightning.level, 2);
  assert.equal(lightning.orbiters.length, 3);
  assert.equal(
    resolveAbilityDamage(
      lightning,
      lightning.orbiters[0].payload.damageEffects[0].config,
    ),
    GAME.upgrade.lightningDamage
      + GAME.ball.levelDamageBonus
      + GAME.ball.levelLightningDamageBonus,
  );
  assert.ok(lightning.orbiters.every(({ payload }) => payload.type === 'lightning'));
  scene.exit();
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

test('场上球达到六十颗时暂停所有自动发射，腾出位置后恢复且不会超限', () => {
  const events = new EventBus();
  const launches = [];
  events.on('ball:launched', (payload) => launches.push(payload));
  const scene = new BreakoutScene();
  scene.enter({
    engine: { setPaused() {} },
    input: { pointer: {}, pressed() { return false; }, isDown() { return false; } },
    events,
    ctx: null,
    plugins: { plugins: new Map() },
  });
  scene.startNewGame();

  for (let index = 0; index < GAME.ball.maximumActiveCount; index += 1) {
    scene.world.add(scene.ballFactory.createPrimary({
      x: GAME.width / 2,
      y: GAME.height / 2,
      angle: -Math.PI / 2,
      speed: 0,
    }));
  }
  scene.world.flush();
  scene.upgrades.levels.doubleShot = 1;
  scene.autoFire.timeUntilShot = 0;
  scene.autoFire.rapidShotsRemaining = 4;
  scene.autoFire.timeUntilRapidShot = 0;

  scene.update(.1);
  assert.equal(scene.world.all('ball').length, GAME.ball.maximumActiveCount);
  assert.equal(scene.autoFire.timeUntilShot, 0);
  assert.equal(scene.autoFire.rapidShotsRemaining, 4);
  assert.equal(launches.length, 0);

  scene.world.first('ball').destroy();
  scene.world.flush();
  scene.update(.1);
  assert.equal(scene.world.all('ball').length, GAME.ball.maximumActiveCount);
  assert.equal(scene.autoFire.rapidShotsRemaining, 3);
  assert.equal(launches.length, 1);
  scene.exit();
});

test('五连速射概率可强化三级，触发后按短间隔共发射五颗球', () => {
  const events = new EventBus();
  const input = { pointer: { active: false, justPressed: false }, pressed() { return false; }, isDown() { return false; } };
  const scene = new BreakoutScene();
  const launches = [];
  const volleys = [];
  events.on('ball:launched', (payload) => launches.push(payload));
  events.on('ball:rapid-volley', (payload) => volleys.push(payload));
  scene.enter({
    engine: { setPaused() {} }, input, events, ctx: null,
    plugins: { plugins: new Map() },
  });
  scene.startNewGame();

  for (let level = 0; level < GAME.upgrade.rapidVolleyMaxLevel; level += 1) {
    scene.upgrades.waitingForChoice = true;
    scene.upgrades.pendingChoices = 1;
    scene.state = 'upgrading';
    assert.equal(scene.chooseUpgrade('rapidVolley'), true);
  }
  assert.ok(Math.abs(
    scene.upgrades.rapidVolleyChance
      - GAME.upgrade.rapidVolleyChancePerLevel * GAME.upgrade.rapidVolleyMaxLevel,
  ) < .0001);
  assert.equal(scene.upgrades.isAvailable('rapidVolley'), false);

  scene.autoFire.random = () => 0;
  scene.autoFire.timeUntilShot = 0;
  scene.update(1 / 120);
  for (let index = 1; index < GAME.upgrade.rapidVolleyBallCount; index += 1) {
    scene.update(GAME.upgrade.rapidVolleyShotInterval + .001);
  }
  assert.equal(volleys.length, 1);
  assert.equal(volleys[0].count, GAME.upgrade.rapidVolleyBallCount);
  assert.equal(launches.length, GAME.upgrade.rapidVolleyBallCount);
  assert.ok(launches.every(({ source }) => source === 'automatic'));
  scene.exit();
});

test('双重挡板分三级扩展副挡板，并参与球反弹', () => {
  const events = new EventBus();
  const input = { pointer: { active: false, x: 0, justPressed: false }, pressed() { return false; }, isDown() { return false; } };
  const scene = new BreakoutScene();
  scene.enter({
    engine: { setPaused() {} }, input, events, ctx: null,
    plugins: { plugins: new Map() },
  });
  scene.startNewGame();
  scene.upgrades.waitingForChoice = true;
  scene.upgrades.pendingChoices = 1;
  scene.state = 'upgrading';
  assert.equal(scene.chooseUpgrade('doublePaddle'), true);
  scene.world.flush();

  const primary = scene.world.all('paddle').find(({ role }) => role === 'primary');
  const secondary = scene.world.all('paddle').find(({ role }) => role === 'secondary');
  assert.ok(secondary);
  assert.equal(secondary.width, primary.width * GAME.upgrade.doublePaddleWidthRatioPerLevel);
  assert.equal(primary.y - secondary.y, GAME.upgrade.doublePaddleVerticalOffset);
  assert.equal(scene.upgrades.isAvailable('doublePaddle'), true);

  input.pointer.active = true;
  input.pointer.x = 430;
  scene.update(.05);
  assert.ok(Math.abs(
    secondary.x + secondary.width / 2 - (primary.x + primary.width / 2),
  ) < .0001);

  const ball = scene.ballFactory.createPrimary({
    x: secondary.x + secondary.width / 2,
    y: secondary.y - GAME.ball.radius + 1,
    angle: Math.PI / 2,
    speed: 100,
  });
  scene.world.add(ball);
  scene.world.flush();
  scene.ballPhysics.update(0);
  assert.ok(ball.velocityY < 0);
  scene.exit();
});

test('所有已解锁特殊球与普通球各占一个等概率替代槽位', () => {
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

  for (const id of ['topLaunch', 'blastLaunch', 'voidOrbit', 'microNavigation', 'lightning']) {
    scene.upgrades.waitingForChoice = true;
    scene.upgrades.pendingChoices = 1;
    scene.state = 'upgrading';
    assert.equal(scene.chooseUpgrade(id), true);
  }

  const expectedTypes = [
    'basic', 'top-launch', 'blast-launch', 'void-orbit', 'micro-navigation', 'lightning',
  ];
  const availableShots = scene.autoFire.availablePrimaryShots();
  assert.deepEqual(availableShots.map(({ shotType }) => shotType), expectedTypes);
  assert.deepEqual(
    availableShots.map(({ randomized }) => randomized),
    [false, true, false, false, false, false],
  );

  for (let index = 0; index < expectedTypes.length; index += 1) {
    scene.autoFire.random = () => (index + .1) / expectedTypes.length;
    scene.autoFire.timeUntilShot = 0;
    scene.update(1 / 120);
  }
  assert.deepEqual(
    launches.map(({ source }) => source),
    ['automatic', 'top-launch', 'blast-launch', 'void-orbit', 'micro-navigation', 'lightning'],
  );
  assert.equal(launches.length, expectedTypes.length);
  const paddleLaunches = launches.filter(({ emitterId }) => emitterId === 'paddle');
  assert.ok(paddleLaunches.every(({ ball }) => Math.abs(ball.velocityX) < .0001));
  assert.ok(paddleLaunches.every(({ ball }) => ball.velocityY < 0));
  scene.exit();
});

test('运行时注册的天顶虚空配方进入发射池并同时继承双方强化归属', () => {
  const events = new EventBus();
  const launches = [];
  events.on('ball:launched', (payload) => launches.push(payload));
  const scene = new BreakoutScene();
  scene.enter({
    engine: { setPaused() {} },
    input: { pointer: {}, pressed() { return false; }, isDown() { return false; } },
    events,
    ctx: null,
    plugins: { plugins: new Map() },
  });
  scene.startNewGame();
  const chooseDirectly = (id) => {
    scene.upgrades.waitingForChoice = true;
    scene.upgrades.pendingChoices = 1;
    scene.state = 'upgrading';
    assert.equal(scene.chooseUpgrade(id), true);
  };
  chooseDirectly('topLaunch');
  chooseDirectly('voidOrbit');

  scene.fusionEnabled = false;
  scene.registerBallFusion('top-void', {
    componentIds: ['top-launch', 'void-orbit'],
    isAvailable: ({ scene: currentScene }) => currentScene.fusionEnabled,
    overrides: {
      emitterId: 'top',
      randomized: true,
      definitionId: VOID_ORBIT_BALL_ID,
      visualOverrides: { renderer: 'void-orbit' },
      visualLayers: ['top-launch-aura'],
    },
  });
  assert.equal(
    scene.autoFire.availablePrimaryShots().some(({ fusionId }) => fusionId === 'top-void'),
    false,
  );
  scene.fusionEnabled = true;
  assert.equal(scene.autoFire.availablePrimaryShots().at(-1).fusionId, 'top-void');

  scene.autoFire.random = () => .99;
  scene.autoFire.timeUntilShot = 0;
  scene.update(1 / 120);
  const fusionLaunch = launches.find(({ fusionId }) => fusionId === 'top-void');
  assert.ok(fusionLaunch);
  assert.equal(fusionLaunch.emitterId, 'top');
  assert.equal(fusionLaunch.ball.fusionId, 'top-void');
  assert.deepEqual(fusionLaunch.ball.fusionComponents, ['top-launch', 'void-orbit']);
  assert.equal(fusionLaunch.ball.hasTrait(BALL_TRAITS.TOP_LAUNCH), true);
  assert.equal(fusionLaunch.ball.hasTrait(BALL_TRAITS.VOID_ORBIT), true);
  assert.equal(fusionLaunch.ball.orbiters.length, 2);
  assert.equal(
    Math.hypot(fusionLaunch.ball.velocityX, fusionLaunch.ball.velocityY),
    GAME.ball.speed * GAME.upgrade.topLaunchSpeedMultiplier,
  );
  assert.ok(fusionLaunch.ball.velocityY > 0);
  assert.deepEqual(fusionLaunch.ball.visual.layers, ['top-launch-aura']);

  chooseDirectly('voidOrbitRadius');
  assert.ok(fusionLaunch.ball.orbiters.every(({ orbitRadius }) => (
    orbitRadius === scene.upgrades.voidOrbitRadius
  )));
  chooseDirectly('topRecovery');
  fusionLaunch.ball.y = GAME.playBottom + fusionLaunch.ball.radius + 1;
  fusionLaunch.ball.velocityY = 100;
  scene.ballPhysics.random = () => .2;
  scene.ballPhysics.update(0);
  assert.equal(fusionLaunch.ball.active, true);
  assert.ok(fusionLaunch.ball.velocityY < 0);

  chooseDirectly('lightning');
  scene.registerBallFusion('void-lightning', {
    componentIds: ['void-orbit', 'chain-lightning'],
    overrides: {
      emitterId: 'paddle',
      randomized: false,
      definitionId: LIGHTNING_BALL_ID,
      visualOverrides: { renderer: 'lightning' },
    },
  });
  scene.autoFire.timeUntilShot = 0;
  scene.update(1 / 120);
  const abilityFusion = launches.find(({ fusionId }) => fusionId === 'void-lightning');
  assert.ok(abilityFusion);
  assert.equal(abilityFusion.ball.hasTrait(BALL_TRAITS.VOID_ORBIT), true);
  assert.equal(abilityFusion.ball.hasTrait(BALL_TRAITS.CHAIN_LIGHTNING), true);
  assert.equal(abilityFusion.ball.orbiters.length, 2);
  assert.ok(abilityFusion.ball.damageEffects.some(({ id }) => id === 'chain-lightning'));
  scene.exit();
});

test('天顶增援与普通球等概率替代，并从顶部发射双倍速度球', () => {
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
  assert.deepEqual(scene.autoFire.availablePrimaryShots().map(({ shotType }) => shotType), ['basic', 'top-launch']);

  scene.autoFire.random = () => .99;
  scene.autoFire.timeUntilShot = 0;
  scene.update(1 / 120);
  assert.equal(launches.length, 1);

  const topLaunch = launches.find(({ emitterId }) => emitterId === 'top');
  assert.equal(topLaunch.source, 'top-launch');
  assert.equal(topLaunch.ball.launchSource, 'top-launch');
  assert.ok(topLaunch.ball.velocityY > 0);
  assert.equal(topLaunch.ball.visual.renderer, 'top-launch');
  assert.equal(topLaunch.ball.visual.color, '#ffad5a');
  assert.equal(topLaunch.ball.visual.trailLength, 16);
  const topSpeed = Math.hypot(topLaunch.ball.velocityX, topLaunch.ball.velocityY);
  assert.ok(Math.abs(topSpeed / GAME.ball.speed - GAME.upgrade.topLaunchSpeedMultiplier) < .0001);
  assert.equal(scene.world.all('particle').length, 20);
  assert.equal(scene.upgrades.options().some((option) => option.id === 'topLaunch'), false);
  scene.exit();
});

test('爆裂核心替代普通球并带有周期范围伤害和独特外观', () => {
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

  scene.autoFire.random = () => .99;
  scene.autoFire.timeUntilShot = 0;
  scene.update(1 / 120);
  assert.equal(launches.length, 1);
  const blastLaunch = launches.find(({ source }) => source === 'blast-launch');
  assert.ok(blastLaunch);
  assert.equal(blastLaunch.emitterId, 'paddle');
  assert.equal(blastLaunch.ball.launchSource, 'blast-launch');
  assert.equal(blastLaunch.ball.visual.renderer, 'blast-core');
  assert.equal(blastLaunch.ball.visual.trailLength, 12);
  assert.equal(blastLaunch.ball.periodicEffects.length, 1);
  assert.equal(blastLaunch.ball.periodicEffects[0].id, 'area-blast');

  const target = scene.world.first('brick');
  target.hitPoints = 100;
  target.maxHitPoints = 100;
  blastLaunch.ball.x = target.x + target.width / 2;
  blastLaunch.ball.y = target.y + target.height / 2;
  const farBrick = scene.world.all('brick').find((brick) => (
    Math.hypot(
      brick.x + brick.width / 2 - blastLaunch.ball.x,
      brick.y + brick.height / 2 - blastLaunch.ball.y,
    ) > GAME.upgrade.blastRadius + 40
  ));
  if (farBrick) {
    farBrick.hitPoints = 100;
    farBrick.maxHitPoints = 100;
  }

  scene.ballAbilities.update(GAME.upgrade.blastInterval);
  scene.world.flush();
  assert.equal(explosions.length, 1);
  assert.equal(explosions[0].radius, GAME.upgrade.blastRadius);
  assert.ok(explosions[0].hitBricks.includes(target));
  assert.equal(target.hitPoints, 90);
  if (farBrick) assert.equal(farBrick.hitPoints, 100);
  assert.equal(scene.world.all('blast-wave').length, 1);
  assert.ok(scene.world.all('particle').length >= 26);
  assert.equal(scene.upgrades.options().some((option) => option.id === 'blastLaunch'), false);
  scene.exit();
});

test('虚空双星由核心负责反弹死亡，两颗子球独立造成接触伤害', () => {
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
  assert.equal(scene.chooseUpgrade('voidOrbit'), true);

  scene.autoFire.random = () => .99;
  scene.autoFire.timeUntilShot = 0;
  scene.update(1 / 120);
  const voidLaunch = launches.find(({ source }) => source === 'void-orbit');
  assert.ok(voidLaunch);
  assert.equal(voidLaunch.definitionId, VOID_ORBIT_BALL_ID);
  assert.equal(voidLaunch.ball.visual.renderer, 'void-orbit');
  assert.equal(voidLaunch.ball.contactDamage, false);
  assert.equal(voidLaunch.ball.orbiters.length, 2);
  assert.equal(voidLaunch.ball.orbiters[0].damage, GAME.upgrade.voidOrbiterDamage);
  assert.ok(voidLaunch.ball.trail.every((point) => Number.isFinite(point.age)));
  const orbiterTrail = getOrbiterTrail(voidLaunch.ball, voidLaunch.ball.orbiters[0]);
  assert.equal(orbiterTrail.length, voidLaunch.ball.trail.length);
  assert.ok(orbiterTrail.every(({ x, y }) => Number.isFinite(x) && Number.isFinite(y)));

  const voidBall = voidLaunch.ball;
  const target = scene.world.first('brick');
  target.hitPoints = 100;
  target.maxHitPoints = 100;
  voidBall.velocityX = 100;
  voidBall.velocityY = 0;
  const coreHit = scene.ballCombat.resolveBrickCollision({
    ball: voidBall,
    brick: target,
    normal: { nx: -1, ny: 0, depth: 1 },
  });
  assert.equal(coreHit.damage, 0);
  assert.equal(target.hitPoints, 100);
  assert.ok(voidBall.velocityX < 0);

  const targetPoints = target.worldPoints();
  const targetCenterX = targetPoints.reduce((sum, point) => sum + point.x, 0) / targetPoints.length;
  const targetCenterY = targetPoints.reduce((sum, point) => sum + point.y, 0) / targetPoints.length;
  voidBall.age = 0;
  voidBall.x = targetCenterX - GAME.upgrade.voidOrbitRadius;
  voidBall.y = targetCenterY;
  scene.orbiterDamage.update();
  assert.equal(target.hitPoints, 90);
  scene.orbiterDamage.update();
  assert.equal(target.hitPoints, 90);

  voidBall.x -= 100;
  scene.orbiterDamage.update();
  voidBall.x += 100;
  scene.orbiterDamage.update();
  assert.equal(target.hitPoints, 80);

  voidBall.y = GAME.playBottom + voidBall.radius + 1;
  voidBall.velocityY = 100;
  scene.ballPhysics.random = () => 1;
  scene.ballPhysics.update(0);
  assert.equal(voidBall.active, false);
  assert.equal(scene.upgrades.isAvailable('voidOrbit'), false);
  scene.exit();
});

test('虚空超旋需要虚空双星前置，最多三级并作用于现有及未来子球', () => {
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

  assert.equal(scene.upgrades.isAvailable('voidOrbitSpeed'), false);
  prepareChoice();
  assert.equal(scene.chooseUpgrade('voidOrbitSpeed'), false);
  assert.equal(scene.chooseUpgrade('voidOrbit'), true);
  assert.equal(scene.upgrades.isAvailable('voidOrbitSpeed'), true);

  scene.autoFire.random = () => .99;
  scene.autoFire.timeUntilShot = 0;
  scene.update(1 / 120);
  const existingVoidBall = scene.world.all('ball').find((ball) => ball.launchSource === 'void-orbit');
  assert.ok(existingVoidBall);
  assert.ok(existingVoidBall.orbiters.every(
    (orbiter) => orbiter.angularSpeed === GAME.upgrade.voidOrbiterAngularSpeed,
  ));

  for (let level = 1; level <= GAME.upgrade.voidOrbiterSpeedMaxLevel; level += 1) {
    prepareChoice();
    assert.equal(scene.chooseUpgrade('voidOrbitSpeed'), true);
    const expectedSpeed = GAME.upgrade.voidOrbiterAngularSpeed
      * GAME.upgrade.voidOrbiterSpeedMultiplierPerLevel ** level;
    assert.ok(existingVoidBall.orbiters.every(
      (orbiter) => Math.abs(orbiter.angularSpeed - expectedSpeed) < .0001,
    ));
  }
  assert.equal(scene.upgrades.isAvailable('voidOrbitSpeed'), false);

  scene.autoFire.timeUntilShot = 0;
  scene.update(1 / 120);
  const voidBalls = scene.world.all('ball').filter((ball) => ball.launchSource === 'void-orbit');
  assert.equal(voidBalls.length, 2);
  assert.ok(voidBalls[1].orbiters.every(
    (orbiter) => Math.abs(orbiter.angularSpeed - scene.upgrades.voidOrbiterAngularSpeed) < .0001,
  ));
  scene.exit();
});

test('微导航每次反弹只锁定一个附近目标，导航增幅最多强化三级', () => {
  const events = new EventBus();
  const selectedUpgrades = [];
  events.on('upgrade:selected', (payload) => selectedUpgrades.push(payload));
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

  assert.equal(scene.upgrades.isAvailable('navigationStrength'), false);
  prepareChoice();
  assert.equal(scene.chooseUpgrade('microNavigation'), true);
  assert.equal(scene.upgrades.isAvailable('navigationStrength'), true);
  const firstNavigationStrengthCard = scene.upgrades.catalog()
    .find(({ id }) => id === 'navigationStrength');
  assert.match(firstNavigationStrengthCard.description, /0\.55 → 0\.77 rad\/s/);
  scene.autoFire.random = () => .99;
  scene.autoFire.timeUntilShot = 0;
  scene.update(1 / 120);

  const navigationBall = scene.world.all('ball').find(({ definitionId }) => definitionId === MICRO_NAVIGATION_BALL_ID);
  assert.ok(navigationBall);
  assert.equal(navigationBall.visual.renderer, 'micro-navigation');
  assert.equal(navigationBall.guidance.strength, GAME.upgrade.navigationStrength);
  const initialTarget = scene.world.first('brick');
  navigationBall.x = initialTarget.x + initialTarget.width / 2 - 100;
  navigationBall.y = initialTarget.y + initialTarget.height / 2;
  navigationBall.velocityX = 0;
  navigationBall.velocityY = -navigationBall.speed;
  const angleBefore = Math.atan2(navigationBall.velocityY, navigationBall.velocityX);
  scene.guidance.update(.1);
  const angleAfter = Math.atan2(navigationBall.velocityY, navigationBall.velocityX);
  assert.notEqual(angleAfter, angleBefore);
  const firstTargetId = navigationBall.guidance.targetId;
  assert.ok(firstTargetId);

  const firstTarget = scene.world.all('brick').find(({ id }) => id === firstTargetId);
  firstTarget.destroy();
  scene.guidance.update(.1);
  assert.equal(navigationBall.guidance.targetId, firstTargetId);
  events.emit('ball:bounce', { ball: navigationBall, surface: 'wall' });
  assert.notEqual(navigationBall.guidance.targetId, firstTargetId);

  for (let level = 1; level <= GAME.upgrade.navigationStrengthMaxLevel; level += 1) {
    prepareChoice();
    assert.equal(scene.chooseUpgrade('navigationStrength'), true);
    const expected = GAME.upgrade.navigationStrength
      * GAME.upgrade.navigationStrengthMultiplierPerLevel ** level;
    assert.ok(Math.abs(navigationBall.guidance.strength - expected) < .0001);
    assert.equal(selectedUpgrades.at(-1).name, '导航增幅');
    assert.equal(selectedUpgrades.at(-1).level, level);
    assert.equal(selectedUpgrades.at(-1).maxLevel, GAME.upgrade.navigationStrengthMaxLevel);
  }
  assert.equal(scene.upgrades.isAvailable('navigationStrength'), false);
  const cappedNavigationStrengthCard = scene.upgrades.catalog()
    .find(({ id }) => id === 'navigationStrength');
  assert.match(cappedNavigationStrengthCard.description, /1\.51 rad\/s（已满级）/);

  scene.autoFire.timeUntilShot = 0;
  scene.update(1 / 120);
  const navigationBalls = scene.world.all('ball')
    .filter(({ definitionId }) => definitionId === MICRO_NAVIGATION_BALL_ID);
  assert.equal(navigationBalls.length, 2);
  assert.ok(Math.abs(
    navigationBalls[1].guidance.strength - scene.upgrades.navigationStrength,
  ) < .0001);
  scene.exit();
});

test('闪电球以闪电链代替常规伤害，扩链强化增加额外目标且最多三级', () => {
  const events = new EventBus();
  const input = { pointer: { active: false, justPressed: false }, pressed() { return false; }, isDown() { return false; } };
  const scene = new BreakoutScene();
  const chains = [];
  events.on('ball:lightning-chain', (payload) => chains.push(payload));
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

  assert.equal(scene.upgrades.isAvailable('lightningJumps'), false);
  prepareChoice();
  assert.equal(scene.chooseUpgrade('lightning'), true);
  scene.autoFire.random = () => .99;
  scene.autoFire.timeUntilShot = 0;
  scene.update(1 / 120);
  const lightningBall = scene.world.all('ball').find(({ definitionId }) => definitionId === LIGHTNING_BALL_ID);
  assert.ok(lightningBall);
  assert.equal(lightningBall.contactDamage, false);
  assert.equal(lightningBall.damage, 0);
  assert.equal(lightningBall.visual.renderer, 'lightning');

  const bricks = scene.world.all('brick');
  const target = bricks[0];
  const nearby = bricks[1];
  nearby.x = target.x + 20;
  nearby.y = target.y + 10;
  for (const brick of bricks) {
    brick.hitPoints = 100;
    brick.maxHitPoints = 100;
  }
  lightningBall.velocityX = 100;
  lightningBall.velocityY = 0;
  const result = scene.ballCombat.resolveBrickCollision({
    ball: lightningBall,
    brick: target,
    normal: { nx: -1, ny: 0, depth: 1 },
  });
  assert.equal(result.damage, 0);
  assert.equal(target.hitPoints, 90);
  assert.equal(chains.length, 1);
  assert.equal(chains[0].targets.length, 2);
  assert.equal(chains[0].targets[1].hitPoints, 90);
  assert.ok(lightningBall.velocityX < 0);
  scene.world.flush();
  assert.equal(scene.world.all('lightning-arc').length, 1);

  for (let level = 1; level <= GAME.upgrade.lightningJumpsMaxLevel; level += 1) {
    prepareChoice();
    assert.equal(scene.chooseUpgrade('lightningJumps'), true);
    const effect = lightningBall.damageEffects.find(({ id }) => id === 'chain-lightning');
    assert.equal(
      effect.config.additionalTargets,
      GAME.upgrade.lightningAdditionalTargets
        + GAME.upgrade.lightningAdditionalTargetsPerLevel * level,
    );
  }
  assert.equal(scene.upgrades.isAvailable('lightningJumps'), false);

  scene.autoFire.timeUntilShot = 0;
  scene.update(1 / 120);
  const lightningBalls = scene.world.all('ball')
    .filter(({ definitionId }) => definitionId === LIGHTNING_BALL_ID);
  assert.equal(lightningBalls.length, 2);
  const futureEffect = lightningBalls[1].damageEffects.find(({ id }) => id === 'chain-lightning');
  assert.equal(futureEffect.config.additionalTargets, scene.upgrades.lightningAdditionalTargets);
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

  scene.autoFire.random = () => .99;
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

  scene.autoFire.random = () => .99;
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

test('方块血量按可调公式成长，并由全局系数统一减半', () => {
  assert.equal(GAME.brick.healthMultiplier, 0.5);
  assert.equal(calculateExpectedBrickHitPoints({ elapsed: 0, score: 0 }), 7);
  assert.ok(calculateExpectedBrickHitPoints({ elapsed: 60, score: 0 }) > 10);
  assert.ok(calculateExpectedBrickHitPoints({ elapsed: 0, score: 5000 }) > 10);
  assert.ok(calculateExpectedBrickHitPoints({ elapsed: 600, score: 100000 }) > 75);
  assert.equal(selectBrickHitPoints({ elapsed: 0, score: 0 }, () => .5), 7);

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
    6,
  );
});

test('世界等级使用无固定等级上限的幂函数成长，并保护极端数值', () => {
  const levelOne = calculateWorldLevelModifiers(1);
  const levelTen = calculateWorldLevelModifiers(10);
  const levelMillion = calculateWorldLevelModifiers(1_000_000);

  assert.equal(levelOne.level, 1);
  assert.equal(levelOne.enemyHealthMultiplier, 1);
  assert.equal(levelOne.bossHealthMultiplier, 1);
  assert.equal(levelOne.scoreMultiplier, 1);
  assert.equal(levelOne.bonusChestExpectation, 0);
  assert.ok(levelTen.enemyHealthMultiplier > levelTen.scoreMultiplier);
  assert.ok(levelTen.bossHealthMultiplier > 1);
  assert.ok(levelTen.bonusChestExpectation > 0);
  assert.ok(levelMillion.enemyHealthMultiplier > levelTen.enemyHealthMultiplier);
  assert.ok(levelMillion.scoreMultiplier > levelTen.scoreMultiplier);
  assert.ok(Object.values(levelMillion).every(Number.isFinite));
  assert.equal(normalizeWorldLevel(123456789), 123456789);
  assert.equal(normalizeWorldLevel(-20), 1);
  assert.equal(clampWorldValue(Infinity), GAME.worldLevel.maximumNumericValue);
  assert.equal(formatWorldLevel(1), 'W1');
  assert.equal(formatWorldLevel(10000).startsWith('W'), true);

  const levelOneHp = calculateExpectedBrickHitPoints({ elapsed: 60, score: 5000 });
  const levelTenHp = calculateExpectedBrickHitPoints({
    elapsed: 60,
    score: 5000,
    worldLevel: 10,
  });
  assert.equal(
    levelTenHp,
    levelOneHp * levelTen.enemyHealthMultiplier,
  );
});

test('世界等级在局外可调整，开始对局后锁定并写入快照', () => {
  const events = new EventBus();
  const scene = new BreakoutScene();
  scene.enter({
    engine: { paused: false, setPaused(value) { this.paused = value; } },
    input: { pointer: {}, pressed() { return false; }, isDown() { return false; } },
    events,
    ctx: null,
    plugins: { plugins: new Map() },
    worldLevel: 4,
  });

  assert.equal(scene.snapshot().worldLevel, 4);
  assert.equal(scene.increaseWorldLevel(2), true);
  assert.equal(scene.worldLevel, 6);
  scene.startNewGame();
  assert.equal(scene.setWorldLevel(99), false);
  assert.equal(scene.snapshot().worldLevel, 6);
  scene.settleRun();
  assert.equal(scene.setWorldLevel(99), true);
  assert.equal(scene.snapshot().worldLevel, 99);
  scene.exit();
});

test('世界等级需要击败当前最高世界的第七个Boss逐级解锁并持久化', () => {
  const values = new Map();
  const storage = {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, value); },
  };
  const events = new EventBus();
  const unlocks = [];
  events.on('world-level:unlocked', (payload) => unlocks.push(payload));
  const progression = new WorldProgression({ storage, events });

  assert.deepEqual(progression.snapshot(), {
    selectedLevel: 1,
    unlockedLevel: 1,
    unlockBossWave: 7,
  });
  assert.equal(progression.select(2), false);
  assert.equal(progression.recordBossDefeat({ worldLevel: 1, bossWave: 6 }), null);
  assert.equal(progression.recordBossDefeat({ worldLevel: 1, bossWave: 7 }).unlockedLevel, 2);
  assert.equal(progression.select(2), true);
  assert.equal(progression.recordBossDefeat({ worldLevel: 1, bossWave: 7 }), null);
  assert.equal(progression.recordBossDefeat({ worldLevel: 2, bossWave: 7 }).unlockedLevel, 3);
  assert.equal(unlocks.length, 2);

  const restored = new WorldProgression({ storage });
  assert.equal(restored.selectedLevel, 2);
  assert.equal(restored.unlockedLevel, 3);
});

test('场景限制世界选择范围，并在击杀第七波Boss时解锁下一世界', () => {
  const events = new EventBus();
  const progression = new WorldProgression({ storage: null, events });
  const scene = new BreakoutScene();
  scene.worldProgression = progression;
  scene.enter({
    engine: { paused: false, setPaused(value) { this.paused = value; } },
    input: { pointer: {}, pressed() { return false; }, isDown() { return false; } },
    events,
    ctx: null,
    plugins: { plugins: new Map() },
  });

  assert.equal(scene.setWorldLevel(2), false);
  scene.startNewGame();
  const seventhBoss = new Brick({
    x: 0,
    y: 0,
    width: 100,
    height: 60,
    hitPoints: 1,
    score: 0,
    variant: 'boss',
    bossWave: 7,
  });
  events.emit('brick:destroyed', { brick: seventhBoss });
  assert.equal(progression.unlockedLevel, 2);
  assert.equal(scene.worldLevel, 1);
  scene.settleRun();
  assert.equal(scene.setWorldLevel(2), true);
  assert.equal(scene.worldLevel, 2);
  scene.exit();
});

test('收集品图鉴完整收录十九件数值藏品和四种史诗挡板', () => {
  assert.equal(COLLECTIBLE_CATALOG.length, 23);
  assert.equal(new Set(COLLECTIBLE_CATALOG.map(({ id }) => id)).size, 23);
  assert.equal(new Set(COLLECTIBLE_CATALOG.map(({ name }) => name)).size, 23);
  const paddles = COLLECTIBLE_CATALOG.filter(({ category }) => category === 'paddle');
  assert.equal(paddles.length, 4);
  assert.ok(paddles.every(({ quality, maxLevel, paddleStyle }) => (
    quality === 'epic' && maxLevel === 1 && paddleStyle
  )));
  assert.equal(COLLECTIBLE_CATALOG.filter(({ category }) => category !== 'paddle').length, 19);
  assert.deepEqual(getCollectible('ascension-memory-core'), {
    id: 'ascension-memory-core',
    name: '升格记忆核',
    quality: 'epic',
    icon: 'ascension-core',
    category: 'growth',
    maxLevel: 10,
    effect: '每级使球获得的升级经验增加 5%。',
  });
  assert.equal(COLLECTIBLE_CATALOG.filter(({ maxLevel }) => maxLevel === Infinity).length, 2);
  assert.equal(PADDLE_SKINS.length, 5);
  assert.ok(Object.values(COLLECTIBLE_QUALITIES).every(({ name, color }) => name && color));
  for (const item of COLLECTIBLE_CATALOG) {
    assert.match(renderCollectibleIcon(item), /<svg/);
    assert.match(renderCollectibleIcon(item), new RegExp(item.id));
  }
});

test('收集品库存限制有限等级、保留无上限成长并持久化挡板装备', () => {
  const values = new Map();
  const storage = {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, value); },
  };
  const events = new EventBus();
  const changes = [];
  events.on('collectible:changed', (payload) => changes.push(payload));
  const inventory = new CollectibleInventory({ storage, events });

  inventory.grant('assault-prism', 99);
  assert.equal(inventory.level('assault-prism'), 10);
  inventory.grant('photon-whetstone', 1234);
  assert.equal(inventory.level('photon-whetstone'), 1234);
  assert.equal(inventory.equipPaddle('paddle-crystal-wing'), false);
  inventory.grant('paddle-crystal-wing');
  assert.equal(inventory.equipPaddle('paddle-crystal-wing'), true);
  assert.equal(inventory.equippedPaddleStyle, 'crystal-wing');
  assert.equal(changes.length, 3);
  inventory.grantChests(3);
  assert.equal(inventory.chests, 3);
  assert.equal(inventory.consumeChest(), true);
  assert.equal(inventory.chests, 2);

  const restored = new CollectibleInventory({ storage });
  assert.equal(restored.level('assault-prism'), 10);
  assert.equal(restored.level('photon-whetstone'), 1234);
  assert.equal(restored.equippedPaddleStyle, 'crystal-wing');
  assert.equal(restored.chests, 2);
  assert.equal(restored.catalogState().find(({ id }) => id === 'paddle-crystal-wing').equipped, true);
  assert.equal(getCollectible('missing-item'), null);
});

test('十九种数值收集品在开局时统一计算为固定战斗修正', () => {
  const modifiers = calculateCollectibleRunModifiers({
    levels: {
      'photon-whetstone': 10,
      'dawn-calibrator': 5,
      'assault-prism': 2,
      'starforge-heart': 3,
      'secondhand-compressor': 5,
      'warp-escapement': 2,
      'zero-hour-hourglass': 1,
      'mirror-launch-spring': 10,
      'extension-keel': 5,
      'return-membrane': 10,
      'hunter-calculus': 10,
      'recoil-capacitor': 10,
      'zenith-velocimeter': 10,
      'fusion-shock-ring': 10,
      'gravity-dial': 10,
      'starhunter-lens': 10,
      'thunder-echo-vial': 10,
      'expedition-star-chart': 10,
      'ascension-memory-core': 10,
    },
  });
  assert.equal(modifiers.baseDamageMultiplier, 1.15);
  assert.equal(modifiers.flatBaseDamageBonus, 21);
  assert.ok(Math.abs(modifiers.fireIntervalMultiplier - .745) < 1e-12);
  assert.equal(modifiers.extraSpecialBallChance, .2);
  assert.equal(modifiers.paddleWidthMultiplier, 1.125);
  assert.equal(modifiers.bottomRetentionChance, .2);
  assert.equal(modifiers.bonusExperienceChance, .5);
  assert.equal(modifiers.recoilDamageMultiplier, 2);
  assert.equal(modifiers.topSpeedDamageScaleBonus, .5);
  assert.equal(modifiers.blastFlatDamageBonus, 30);
  assert.equal(modifiers.blastRadiusBonus, 100);
  assert.equal(modifiers.voidOrbitRadiusMultiplier, 1.2);
  assert.equal(modifiers.voidOrbitSpeedMultiplier, 1.2);
  assert.equal(modifiers.navigationDamageMultiplier, 1.5);
  assert.equal(modifiers.lightningEchoChance, .5);
  assert.equal(modifiers.bossExtraDropChance, .5);
  assert.equal(modifiers.experienceMultiplier, 1.5);
});

test('收集品只在开局建立快照，当局新获得等级从下一局开始生效', () => {
  const values = new Map();
  const storage = {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, value); },
  };
  const events = new EventBus();
  const inventory = new CollectibleInventory({ storage, events });
  inventory.grant('secondhand-compressor');
  inventory.grant('extension-keel');
  const scene = new BreakoutScene();
  scene.collectibles = inventory;
  scene.enter({
    engine: { setPaused() {} },
    input: { pointer: { active: false }, isDown() { return false; } },
    events,
    ctx: null,
    plugins: { plugins: new Map() },
  });
  scene.startNewGame();
  const firstInterval = scene.upgrades.fireInterval;
  assert.equal(scene.world.first('paddle').width, GAME.paddle.width * 1.025);
  inventory.grant('secondhand-compressor', 4);
  inventory.grant('extension-keel', 4);
  assert.equal(scene.upgrades.fireInterval, firstInterval);
  assert.equal(scene.collectibleRun.levels['secondhand-compressor'], 1);
  assert.equal(scene.world.first('paddle').width, GAME.paddle.width * 1.025);

  scene.settleRun();
  scene.startNewGame();
  assert.ok(scene.upgrades.fireInterval < firstInterval);
  assert.equal(scene.collectibleRun.levels['secondhand-compressor'], 5);
  assert.equal(scene.world.first('paddle').width, GAME.paddle.width * 1.125);
  scene.exit();
});

test('伤害、爆炸、虚空、导航和天顶收集品作用于现有特殊球框架', () => {
  const run = createCollectibleRunEffects({
    levels: {
      'photon-whetstone': 10,
      'assault-prism': 2,
      'fusion-shock-ring': 10,
      'gravity-dial': 10,
      'starhunter-lens': 10,
      'zenith-velocimeter': 10,
    },
  });
  const definitions = createDefaultBallDefinitions();
  const ball = new BallFactory(definitions).createPrimary({
    definitionId: MICRO_NAVIGATION_BALL_ID,
    traits: [BALL_TRAITS.BLAST_CORE],
    periodicEffects: [{
      id: 'area-blast', interval: 1, config: { radius: 90, baseDamageScale: 1 },
    }],
    damageEffects: [{
      id: 'impact-blast', config: { radius: 90, baseDamageScale: 1 },
    }],
  });
  run.applyBall(ball);
  assert.equal(ball.baseDamage, 26);
  assert.equal(ball.periodicEffects[0].config.flatDamageBonus, 30);
  assert.equal(ball.periodicEffects[0].config.radius, 190);
  assert.equal(ball.damageEffects[0].config.flatDamageBonus, 30);
  assert.equal(run.scaleBaseDamageGain(5, ball), 8);

  const scene = { collectibleRun: run };
  const upgrades = new UpgradeSystem(scene);
  assert.equal(upgrades.topImpactDamageMultiplier, 1.5);
  assert.equal(upgrades.voidOrbitRadius, GAME.upgrade.voidOrbitRadius * 1.2);
  assert.equal(upgrades.voidOrbiterAngularSpeed, GAME.upgrade.voidOrbiterAngularSpeed * 1.2);
});

test('镜像发射簧独立追加一次可抽取特殊球的发射', () => {
  const inventory = new CollectibleInventory({ storage: null });
  inventory.grant('mirror-launch-spring', 10);
  const events = new EventBus();
  const scene = new BreakoutScene();
  scene.collectibles = inventory;
  scene.enter({
    engine: { setPaused() {} },
    input: { pointer: { active: false }, isDown() { return false; } },
    events,
    ctx: null,
    plugins: { plugins: new Map() },
  });
  scene.startNewGame();
  scene.upgrades.levels.topLaunch = 1;
  const rolls = [0, 1, 0, .99, 1];
  scene.autoFire.random = () => rolls.shift() ?? 1;
  scene.autoFire.timeUntilShot = 0;
  scene.autoFire.update(.01);
  scene.world.flush();
  const balls = scene.world.all('ball');
  assert.equal(balls.length, 2);
  assert.ok(balls.some((ball) => ball.hasTrait(BALL_TRAITS.TOP_LAUNCH)));
  assert.ok(balls.some((ball) => ball.launchSource === 'automatic'));
  scene.exit();
});

test('经验、击杀进度、挡板蓄能、底线保留和闪电回响使用开局收集品修正', () => {
  const inventory = new CollectibleInventory({ storage: null });
  inventory.grant('hunter-calculus', 10);
  inventory.grant('ascension-memory-core', 10);
  inventory.grant('recoil-capacitor', 10);
  inventory.grant('return-membrane', 10);
  inventory.grant('thunder-echo-vial', 10);
  const events = new EventBus();
  const scene = new BreakoutScene();
  scene.collectibles = inventory;
  scene.enter({
    engine: { setPaused() {} },
    input: { pointer: { active: false }, isDown() { return false; } },
    events,
    ctx: null,
    plugins: { plugins: new Map() },
  });
  scene.startNewGame();
  scene.collectibleRun.random = () => 0;

  const experienceBall = scene.ballFactory.createPrimary({ definitionId: BASIC_BALL_ID });
  scene.collectibleRun.applyBall(experienceBall);
  scene.ballCombat.applyDamage({
    ball: experienceBall,
    brick: new Brick({ x: 0, y: 0, width: 30, height: 30, hitPoints: 1 }),
    damage: 999,
  });
  assert.equal(experienceBall.kills, 1);
  assert.equal(experienceBall.experience, 3);
  assert.equal(experienceBall.level, 2);

  const recoilBall = scene.ballFactory.createPrimary({ definitionId: BASIC_BALL_ID });
  scene.collectibleRun.applyBall(recoilBall);
  const recoilBrick = new Brick({ x: 0, y: 0, width: 30, height: 30, hitPoints: 25 });
  recoilBall.collectibleNextHitDamageMultiplier = scene.collectibleRun.recoilDamageMultiplier;
  scene.ballCombat.resolveBrickCollision({
    ball: recoilBall,
    brick: recoilBrick,
    normal: { nx: 0, ny: 1, depth: 1 },
  });
  assert.equal(recoilBrick.hitPoints, 5);
  assert.equal(recoilBall.collectibleNextHitDamageMultiplier, 1);

  const lightningBall = scene.ballFactory.createPrimary({ definitionId: LIGHTNING_BALL_ID });
  scene.collectibleRun.applyBall(lightningBall);
  const lightningBrick = new Brick({ x: 0, y: 0, width: 30, height: 30, hitPoints: 25 });
  scene.ballCombat.resolveBrickCollision({
    ball: lightningBall,
    brick: lightningBrick,
    normal: { nx: 0, ny: 1, depth: 1 },
  });
  assert.equal(lightningBrick.hitPoints, 5);

  const saved = [];
  events.on('ball:saved', (payload) => saved.push(payload));
  const fallingBall = scene.ballFactory.createPrimary({
    definitionId: BASIC_BALL_ID,
    x: GAME.width / 2,
    y: GAME.playBottom + 20,
    angle: Math.PI / 2,
  });
  scene.collectibleRun.applyBall(fallingBall);
  scene.world.add(fallingBall);
  scene.world.flush();
  scene.ballPhysics.random = () => 0;
  scene.ballPhysics.update(.01);
  assert.equal(fallingBall.active, true);
  assert.equal(saved.at(-1).reason, 'collectible-retention');
  scene.exit();
});

test('Boss掉落收集箱，远征星图和世界等级额外箱分别独立计算', () => {
  const inventory = new CollectibleInventory({ storage: null });
  const events = new EventBus();
  const scene = new BreakoutScene();
  scene.collectibles = inventory;
  scene.enter({
    engine: { setPaused() {} },
    input: { pointer: { active: false }, isDown() { return false; } },
    events,
    ctx: null,
    plugins: { plugins: new Map() },
  });
  scene.startNewGame();
  inventory.grant('expedition-star-chart', 10);
  scene.collectibleDrops.random = () => 0;
  scene.collectibleRun.random = () => 0;
  const boss = new Brick({
    x: 0, y: 0, width: 100, height: 60, hitPoints: 1, variant: 'boss',
  });
  const firstDrop = scene.collectibleDrops.handleBrickDestroyed(boss);
  assert.equal(firstDrop.chestCount, 1);
  assert.equal(firstDrop.worldChests, 0);
  assert.equal(firstDrop.starChartChests, 0);
  assert.equal(inventory.chests, 1);
  assert.equal(scene.collectibleRun.bossExtraDropChance, 0);

  scene.settleRun();
  scene.startNewGame();
  scene.collectibleDrops.random = () => 0;
  scene.collectibleRun.random = () => 0;
  assert.equal(scene.collectibleRun.bossExtraDropChance, .5);
  const secondDrop = scene.collectibleDrops.handleBrickDestroyed(boss);
  assert.equal(secondDrop.chestCount, 2);
  assert.equal(secondDrop.worldChests, 0);
  assert.equal(secondDrop.starChartChests, 1);
  assert.equal(inventory.chests, 3);

  scene.settleRun();
  scene.setWorldLevel(100);
  scene.startNewGame();
  scene.collectibleDrops.random = () => 0;
  scene.collectibleRun.random = () => 1;
  const worldDrop = scene.collectibleDrops.handleBrickDestroyed(boss);
  assert.ok(worldDrop.worldChests >= 2);
  assert.equal(worldDrop.starChartChests, 0);
  assert.equal(worldDrop.chestCount, 1 + worldDrop.worldChests);

  scene.collectibleChests.random = () => 0;
  const opened = scene.openCollectibleChest();
  assert.equal(opened.collectible.id, 'photon-whetstone');
  assert.equal(inventory.level('photon-whetstone'), 1);
  assert.equal(opened.remainingChests, inventory.chests);
  scene.exit();
});

test('开箱先按固定品质权重抽取，再在该品质未满级收集品中抽取', () => {
  const inventory = new CollectibleInventory({ storage: null });
  inventory.grantChests(4);
  const events = new EventBus();
  const scene = new BreakoutScene();
  scene.collectibles = inventory;
  scene.enter({
    engine: { setPaused() {} },
    input: { pointer: { active: false }, isDown() { return false; } },
    events,
    ctx: null,
    plugins: { plugins: new Map() },
    worldLevel: 100000,
  });
  const qualities = [];
  for (const qualityRoll of [.1, .7, .9, .99]) {
    const rolls = [qualityRoll, 0];
    scene.collectibleChests.random = () => rolls.shift() ?? 0;
    qualities.push(scene.openCollectibleChest().collectible.quality);
  }
  assert.deepEqual(qualities, ['common', 'rare', 'epic', 'legendary']);
  assert.equal(inventory.chests, 0);
  scene.exit();
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
  assert.equal(waves[0].entryMultiplier, GAME.brick.worldOneFirstBossHealthMultiplier);
  assert.ok(BOSS_SHAPE_IDS.includes(bosses[0].bossShape));
  const bossArchetype = getBossArchetype(bosses[0].bossShape);
  assert.equal(bosses[0].width, Math.round(GAME.brick.bossWidth * bossArchetype.widthScale));
  assert.equal(bosses[0].height, Math.round(GAME.brick.bossHeight * bossArchetype.heightScale));
  assert.equal(bosses[0].color, bossArchetype.color);
  assert.deepEqual(
    bosses[0].points,
    createBossPolygon(bosses[0].width, bosses[0].height, bosses[0].bossShape),
  );
  assert.ok(bosses[0].points.length >= 6);
  assert.ok(bosses[0].maxHitPoints > Math.max(...minions.map((brick) => brick.maxHitPoints)));
  assert.ok(bosses[0].width > Math.max(...minions.map((brick) => brick.width)));
  assert.ok([...bosses, ...minions].every((brick) => (
    brick.x >= GAME.brick.spawnSideMargin
    && brick.x + brick.width <= GAME.width - GAME.brick.spawnSideMargin
  )));
  scene.exit();
});

test('世界 1 首个 Boss 获得入门减血，但不削弱后续世界和波次', () => {
  assert.equal(
    calculateBossEntryMultiplier({ bossWave: 1, worldLevel: 1 }),
    0.8,
  );
  assert.equal(calculateBossEntryMultiplier({ bossWave: 2, worldLevel: 1 }), 1);
  assert.equal(calculateBossEntryMultiplier({ bossWave: 1, worldLevel: 2 }), 1);
});

test('第五个 Boss 起终局压力按波次复合增长', () => {
  const interval = GAME.brick.bossWaveInterval;
  const beforeFifth = calculateLateGamePressure(interval * 5 - .01);
  const fifth = calculateLateGamePressure(interval * 5);
  const sixth = calculateLateGamePressure(interval * 6);
  const seventh = calculateLateGamePressure(interval * 7);

  assert.equal(beforeFifth.tier, 0);
  assert.equal(beforeFifth.healthMultiplier, 1);
  assert.equal(fifth.tier, 1);
  assert.equal(sixth.tier, 2);
  assert.equal(seventh.tier, 3);
  assert.ok(fifth.healthMultiplier > 1);
  assert.ok(sixth.healthMultiplier > fifth.healthMultiplier);
  assert.ok(seventh.spawnIntervalMultiplier < sixth.spawnIntervalMultiplier);
  assert.equal(fifth.bossHealthMultiplier, 4);
  assert.equal(sixth.bossHealthMultiplier, 16);
  assert.equal(seventh.bossHealthMultiplier, 64);
  assert.equal(fifth.additionalBossMinions, 2);
  assert.equal(seventh.additionalBossMinions, GAME.brick.lateGame.bossMinionBonusCap);

  const score = 100000;
  const justBefore = calculateExpectedBrickHitPoints({ elapsed: interval * 5 - .01, score });
  const atFifth = calculateExpectedBrickHitPoints({ elapsed: interval * 5, score });
  assert.ok(atFifth > justBefore * 1.35);

  const highScoreExpectedHp = calculateExpectedBrickHitPoints({
    elapsed: interval * 7,
    score: 240000000,
  });
  const seventhBossHp = Math.ceil(
    highScoreExpectedHp
      * GAME.brick.bossHealthMultiplier
      * seventh.bossHealthMultiplier,
  );
  assert.ok(seventhBossHp > 2500000);
});

test('第七个Boss开始进入Boss Rush并在击杀后短间隔刷新强化Boss', () => {
  assert.equal(calculateBossRushHealthMultiplier(6), 1);
  assert.equal(calculateBossRushHealthMultiplier(7), 5);
  assert.equal(calculateBossRushHealthMultiplier(8), 25);

  const events = new EventBus();
  const waves = [];
  const scheduled = [];
  events.on('boss:wave', (payload) => waves.push(payload));
  events.on('boss:rush-next-scheduled', (payload) => scheduled.push(payload));
  const scene = new BreakoutScene();
  scene.enter({
    engine: { setPaused() {} },
    input: { pointer: { active: false }, isDown() { return false; } },
    events,
    ctx: null,
    plugins: { plugins: new Map() },
  });
  scene.startNewGame();
  scene.brickField.elapsed = GAME.brick.bossWaveInterval * 7 - .01;
  scene.brickField.nextBossWave = GAME.brick.bossWaveInterval * 7;
  scene.brickField.bossWaveCount = 6;
  scene.brickField.update(.02);
  scene.world.flush();

  assert.equal(scene.brickField.bossRushActive, true);
  assert.equal(waves.length, 1);
  assert.equal(waves[0].wave, 7);
  assert.equal(waves[0].bossRush, true);
  assert.equal(waves[0].bossRushHealthMultiplier, 5);
  const seventhHp = waves[0].boss.maxHitPoints;

  waves[0].boss.destroy();
  scene.world.flush();
  assert.equal(scene.brickField.handleBossDestroyed(waves[0].boss), true);
  assert.equal(scheduled[0].nextWave, 8);
  scene.brickField.update(GAME.brick.bossRushRespawnDelay - .01);
  scene.world.flush();
  assert.equal(waves.length, 1);
  scene.brickField.update(.02);
  scene.world.flush();
  assert.equal(waves.length, 2);
  assert.equal(waves[1].wave, 8);
  assert.equal(waves[1].bossRushHealthMultiplier, 25);
  assert.ok(waves[1].boss.maxHitPoints > seventhHp * 4);
  scene.exit();
});

test('Boss 波次可随机选择多套对称凸多边形轮廓', () => {
  const width = GAME.brick.bossWidth;
  const height = GAME.brick.bossHeight;
  const selections = [0, .26, .51, .76].map((value) => (
    selectBossPolygon(width, height, () => value)
  ));
  assert.deepEqual(selections.map(({ shapeId }) => shapeId), BOSS_SHAPE_IDS);
  assert.equal(new Set(selections.map(({ points }) => points.length)).size >= 3, true);

  for (const { shapeId, points } of selections) {
    assert.deepEqual(points, createBossPolygon(width, height, shapeId));
    assert.ok(points.every(({ x, y }) => x >= 0 && x <= width && y >= 0 && y <= height));
    for (const point of points) {
      assert.ok(points.some((mirror) => (
        Math.abs(point.x + mirror.x - width) < .0001
        && Math.abs(point.y - mirror.y) < .0001
      )));
    }
    const turns = points.map((point, index) => {
      const next = points[(index + 1) % points.length];
      const after = points[(index + 2) % points.length];
      return (next.x - point.x) * (after.y - next.y)
        - (next.y - point.y) * (after.x - next.x);
    });
    assert.ok(turns.every((turn) => turn > 0) || turns.every((turn) => turn < 0));
  }
});

test('Boss 轮换袋保证四种造型逐轮出现且不跨轮重复', () => {
  const bag = new BossShapeBag(() => 0);
  const sequence = Array.from({ length: BOSS_SHAPE_IDS.length * 3 }, () => bag.next());
  for (let offset = 0; offset < sequence.length; offset += BOSS_SHAPE_IDS.length) {
    assert.deepEqual(
      [...new Set(sequence.slice(offset, offset + BOSS_SHAPE_IDS.length))].sort(),
      [...BOSS_SHAPE_IDS].sort(),
    );
  }
  for (let index = 1; index < sequence.length; index += 1) {
    assert.notEqual(sequence[index], sequence[index - 1]);
  }
});

test('Boss 原型具有明显不同的尺寸、颜色、装甲与标记', () => {
  const archetypes = BOSS_SHAPE_IDS.map((id) => getBossArchetype(id));
  assert.equal(new Set(archetypes.map(({ color }) => color)).size, BOSS_SHAPE_IDS.length);
  assert.equal(new Set(archetypes.map(({ sigil }) => sigil)).size, BOSS_SHAPE_IDS.length);
  assert.equal(new Set(archetypes.map(({ label }) => label)).size, BOSS_SHAPE_IDS.length);
  assert.equal(
    new Set(archetypes.map(({ widthScale, heightScale }) => `${widthScale}:${heightScale}`)).size,
    BOSS_SHAPE_IDS.length,
  );
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
  assert.ok(bricks.every((brick) => (
    brick.x >= GAME.brick.spawnSideMargin
    && brick.x + brick.width <= GAME.width - GAME.brick.spawnSideMargin
  )));
  assert.equal(scene.brickField.spawnTimer, GAME.brick.initialSpawnInterval);
  scene.exit();
});

test('强化所需分数随已获得强化次数持续增加', () => {
  const firstCost = calculateUpgradeScoreCost(0);
  const secondCost = calculateUpgradeScoreCost(1);
  const tenthCost = calculateUpgradeScoreCost(9);
  const twentiethCost = calculateUpgradeScoreCost(20);
  const fortiethCost = calculateUpgradeScoreCost(40);
  const baseCurveConfig = { ...GAME.upgrade, scoreLateGrowthCoefficient: 0 };
  assert.equal(firstCost, GAME.upgrade.scoreInterval);
  assert.ok(secondCost > firstCost);
  assert.ok(tenthCost > secondCost * 2);
  assert.ok(twentiethCost > calculateUpgradeScoreCost(20, baseCurveConfig) * 1.4);
  assert.ok(fortiethCost > calculateUpgradeScoreCost(40, baseCurveConfig) * 2.5);

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

  for (let level = 0; level < GAME.upgrade.paddleLengthMaxLevel; level += 1) {
    chooseDirectly('paddleLength');
  }
  const paddle = scene.world.first('paddle');
  const expectedWidth = GAME.paddle.width
    * GAME.upgrade.paddleLengthMultiplierPerLevel ** GAME.upgrade.paddleLengthMaxLevel;
  assert.ok(Math.abs(paddle.width - expectedWidth) < .0001);
  assert.equal(scene.upgrades.levels.paddleLength, 5);
  assert.equal(scene.upgrades.isAvailable('paddleLength'), false);

  for (let level = 0; level < GAME.upgrade.bottomBounceMaxLevel; level += 1) {
    chooseDirectly('bottomBounce');
  }
  assert.ok(Math.abs(scene.upgrades.bottomBounceChance - .6) < .0001);
  assert.equal(scene.upgrades.isAvailable('bottomBounce'), false);

  for (let level = 0; level < GAME.upgrade.ballLivesMaxLevel; level += 1) {
    chooseDirectly('ballLives');
  }
  assert.equal(
    scene.upgrades.newBallLives,
    GAME.ball.defaultLives + GAME.upgrade.ballLivesPerLevel * GAME.upgrade.ballLivesMaxLevel,
  );
  assert.equal(scene.upgrades.isAvailable('ballLives'), false);

  for (let level = 0; level < GAME.upgrade.rapidFireMaxLevel; level += 1) {
    chooseDirectly('rapidFire');
  }
  assert.equal(scene.upgrades.levels.rapidFire, 5);
  assert.equal(scene.upgrades.isAvailable('rapidFire'), false);

  chooseDirectly('topLaunch');
  for (let level = 0; level < GAME.upgrade.topRecoveryMaxLevel; level += 1) {
    chooseDirectly('topRecovery');
  }
  chooseDirectly('blastLaunch');
  for (let level = 0; level < GAME.upgrade.blastCooldownMaxLevel; level += 1) {
    chooseDirectly('blastCooldown');
  }
  chooseDirectly('voidOrbit');
  for (let level = 0; level < GAME.upgrade.voidOrbiterSpeedMaxLevel; level += 1) {
    chooseDirectly('voidOrbitSpeed');
  }
  for (let level = 0; level < GAME.upgrade.rapidVolleyMaxLevel; level += 1) {
    chooseDirectly('rapidVolley');
  }
  for (let level = 0; level < GAME.upgrade.doublePaddleMaxLevel; level += 1) {
    chooseDirectly('doublePaddle');
  }
  chooseDirectly('microNavigation');
  for (let level = 0; level < GAME.upgrade.navigationStrengthMaxLevel; level += 1) {
    chooseDirectly('navigationStrength');
  }
  chooseDirectly('lightning');
  for (let level = 0; level < GAME.upgrade.lightningJumpsMaxLevel; level += 1) {
    chooseDirectly('lightningJumps');
  }

  const cappedUpgradeIds = [
    'paddleLength',
    'bottomBounce',
    'ballLives',
    'rapidFire',
    'topLaunch',
    'topRecovery',
    'blastLaunch',
    'blastCooldown',
    'voidOrbit',
    'voidOrbitSpeed',
    'rapidVolley',
    'doublePaddle',
    'microNavigation',
    'navigationStrength',
    'lightning',
    'lightningJumps',
  ];
  for (const id of cappedUpgradeIds) assert.equal(scene.upgrades.isAvailable(id), false);
  for (let sample = 0; sample < 20; sample += 1) {
    assert.equal(
      scene.upgrades.options().some((option) => cappedUpgradeIds.includes(option.id)),
      false,
    );
  }

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

test('常规全局速度强化已从强化图鉴和随机池移除', () => {
  const scene = new BreakoutScene();
  scene.enter({
    engine: { setPaused() {} },
    input: { pointer: {}, pressed() { return false; }, isDown() { return false; } },
    events: new EventBus(),
    ctx: null,
    plugins: { plugins: new Map() },
  });
  scene.startNewGame();
  assert.equal(GAME.upgrade.ballSpeedMaxLevel, undefined);
  assert.equal(scene.upgrades.levels.ballSpeed, undefined);
  assert.equal(scene.upgrades.catalog().some(({ id }) => id === 'ballSpeed'), false);
  assert.equal(scene.upgrades.isAvailable('ballSpeed'), false);
  assert.equal(scene.upgrades.options().some(({ id }) => id === 'ballSpeed'), false);
  assert.equal(scene.upgrades.setAutoUpgrade('ballSpeed', true), false);
  scene.exit();
});

test('强化图鉴可预选自动升级，命中随机三选一时不暂停并自动完成选择', () => {
  const events = new EventBus();
  const scene = new BreakoutScene();
  const offered = [];
  const selected = [];
  events.on('upgrade:offered', (payload) => offered.push(payload));
  events.on('upgrade:selected', (payload) => selected.push(payload));
  scene.enter({
    engine: { setPaused() {} },
    input: { pointer: {}, pressed() { return false; }, isDown() { return false; } },
    events,
    ctx: null,
    plugins: { plugins: new Map() },
  });
  scene.startNewGame();

  assert.equal(scene.upgrades.catalogState().length, 24);
  assert.equal(scene.upgrades.setAutoUpgrade('rapidFire', true), true);
  scene.upgrades.options = () => scene.upgrades.catalog().filter(({ id }) => (
    ['rapidFire', 'paddleLength', 'bottomBounce'].includes(id)
  ));
  scene.upgrades.check(scene.upgrades.nextScore);
  assert.equal(scene.upgrades.levels.rapidFire, 1);
  assert.equal(scene.state, 'playing');
  assert.equal(offered.length, 0);
  assert.equal(selected.at(-1).automatic, true);

  scene.upgrades.options = () => scene.upgrades.catalog().filter(({ id }) => (
    ['paddleLength', 'bottomBounce', 'rapidVolley'].includes(id)
  ));
  scene.upgrades.check(scene.upgrades.nextScore);
  assert.equal(scene.state, 'upgrading');
  assert.equal(offered.length, 1);
  scene.exit();
});

test('分裂发射十级后解锁二连发，两颗球分别从完整特殊球池抽取', () => {
  const events = new EventBus();
  const launches = [];
  events.on('ball:launched', (payload) => launches.push(payload));
  const scene = new BreakoutScene();
  scene.enter({
    engine: { setPaused() {} },
    input: { pointer: {}, pressed() { return false; }, isDown() { return false; } },
    events,
    ctx: null,
    plugins: { plugins: new Map() },
  });
  scene.startNewGame();
  const chooseDirectly = (id) => {
    scene.upgrades.waitingForChoice = true;
    scene.upgrades.pendingChoices = 1;
    scene.state = 'upgrading';
    assert.equal(scene.chooseUpgrade(id), true);
  };

  assert.equal(scene.upgrades.isAvailable('doubleShot'), false);
  for (let level = 0; level < GAME.upgrade.multiShotMaxLevel; level += 1) chooseDirectly('multiShot');
  assert.equal(scene.upgrades.isAvailable('multiShot'), false);
  assert.equal(scene.upgrades.isAvailable('doubleShot'), true);
  chooseDirectly('doubleShot');
  chooseDirectly('topLaunch');

  scene.autoFire.random = () => .99;
  scene.autoFire.timeUntilShot = 0;
  scene.update(1 / 120);
  assert.equal(launches.length, 2);
  assert.ok(launches.every(({ source }) => source === 'top-launch'));
  assert.ok(launches.every(({ ball }) => Math.hypot(ball.velocityX, ball.velocityY) === GAME.ball.speed * GAME.upgrade.topLaunchSpeedMultiplier));
  scene.exit();
});

test('新增特殊球衍生强化会作用于现有球和未来发射配置', () => {
  const events = new EventBus();
  const scene = new BreakoutScene();
  scene.enter({
    engine: { setPaused() {} },
    input: { pointer: {}, pressed() { return false; }, isDown() { return false; } },
    events,
    ctx: null,
    plugins: { plugins: new Map() },
  });
  scene.startNewGame();
  const chooseDirectly = (id) => {
    scene.upgrades.waitingForChoice = true;
    scene.upgrades.pendingChoices = 1;
    scene.state = 'upgrading';
    assert.equal(scene.chooseUpgrade(id), true);
  };

  chooseDirectly('topLaunch');
  chooseDirectly('ballDamage');
  chooseDirectly('topImpact');
  scene.autoFire.random = () => .99;
  scene.autoFire.timeUntilShot = 0;
  scene.update(1 / 120);
  const topBall = scene.world.all('ball').find(({ launchSource }) => launchSource === 'top-launch');
  assert.equal(
    topBall.damage,
    Math.round(
      (GAME.combat.baseDamage + GAME.upgrade.ballDamagePerLevel)
        * scene.upgrades.topImpactDamageMultiplier,
    ),
  );
  assert.equal(Number.isInteger(topBall.damage), true);

  chooseDirectly('topImpact');
  assert.equal(
    topBall.damage,
    Math.round(topBall.baseDamage * scene.upgrades.topImpactDamageMultiplier),
  );
  chooseDirectly('topImpact');
  assert.equal(
    topBall.damage,
    Math.round(topBall.baseDamage * scene.upgrades.topImpactDamageMultiplier),
  );

  chooseDirectly('voidOrbit');
  scene.autoFire.timeUntilShot = 0;
  scene.update(1 / 120);
  const voidBall = scene.world.all('ball').find(({ definitionId }) => definitionId === VOID_ORBIT_BALL_ID);
  const originalRadius = voidBall.orbiters[0].orbitRadius;
  chooseDirectly('voidOrbitRadius');
  assert.ok(voidBall.orbiters.every(({ orbitRadius }) => orbitRadius > originalRadius));
  assert.equal(voidBall.orbiters[0].orbitRadius, scene.upgrades.voidOrbitRadius);
  scene.exit();
});

test('爆裂碰撞、导航回马枪和雷霆追击均执行独立判定与效果', () => {
  const events = new EventBus();
  const explosions = [];
  const returns = [];
  const strikes = [];
  events.on('ball:exploded', (payload) => explosions.push(payload));
  events.on('ball:navigation-return', (payload) => returns.push(payload));
  events.on('ball:lightning-strike', (payload) => strikes.push(payload));
  const scene = new BreakoutScene();
  scene.enter({
    engine: { setPaused() {} },
    input: { pointer: {}, pressed() { return false; }, isDown() { return false; } },
    events,
    ctx: null,
    plugins: { plugins: new Map() },
  });
  scene.startNewGame();
  const chooseDirectly = (id) => {
    scene.upgrades.waitingForChoice = true;
    scene.upgrades.pendingChoices = 1;
    scene.state = 'upgrading';
    assert.equal(scene.chooseUpgrade(id), true);
  };

  chooseDirectly('blastLaunch');
  chooseDirectly('blastImpact');
  scene.autoFire.random = () => .99;
  scene.autoFire.timeUntilShot = 0;
  scene.update(1 / 120);
  const blastBall = scene.world.all('ball').find(({ launchSource }) => launchSource === 'blast-launch');
  const blastTarget = scene.world.all('brick')[0];
  blastTarget.hitPoints = 1000;
  scene.ballBehaviors.random = () => 0;
  scene.ballCombat.resolveBrickCollision({
    ball: blastBall,
    brick: blastTarget,
    normal: { nx: 0, ny: 1, depth: 0 },
  });
  assert.equal(explosions.at(-1).cause, 'impact-explosion');

  chooseDirectly('microNavigation');
  chooseDirectly('navigationReturn');
  scene.autoFire.timeUntilShot = 0;
  scene.update(1 / 120);
  const navigationBall = scene.world.all('ball').find(({ definitionId }) => definitionId === MICRO_NAVIGATION_BALL_ID);
  navigationBall.x = blastTarget.x - 40;
  navigationBall.y = blastTarget.y + blastTarget.height / 2;
  navigationBall.velocityX = -Math.abs(navigationBall.velocityX || navigationBall.speed);
  navigationBall.velocityY = 0;
  scene.guidance.random = () => 0;
  events.emit('ball:bounce', { ball: navigationBall, brick: blastTarget, surface: 'brick' });
  scene.guidance.update(GAME.upgrade.navigationReturnDelay + .01);
  assert.equal(returns.length, 1);
  assert.ok(navigationBall.velocityX > 0);

  chooseDirectly('lightning');
  chooseDirectly('lightningStrike');
  scene.autoFire.timeUntilShot = 0;
  scene.update(1 / 120);
  const lightningBall = scene.world.all('ball').find(({ definitionId }) => definitionId === LIGHTNING_BALL_ID);
  const lightningTarget = scene.world.all('brick').find(({ active }) => active);
  lightningTarget.hitPoints = 1000;
  scene.ballCombat.resolveBrickCollision({
    ball: lightningBall,
    brick: lightningTarget,
    normal: { nx: 0, ny: 1, depth: 0 },
  });
  scene.world.flush();
  assert.ok(strikes.length >= 1);
  assert.ok(scene.world.all('lightning-strike').length >= 1);
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
  assert.ok(Math.abs(
    ComboPlugin.scoreMultiplier() - (1 + GAME.combo.multiplierPerKill)
  ) < .0001);

  ComboPlugin.afterUpdate(2.9, context);
  events.emit('brick:destroyed');
  assert.equal(ComboPlugin.combo, 3);
  assert.ok(Math.abs(
    ComboPlugin.scoreMultiplier() - (1 + GAME.combo.multiplierPerKill * 2)
  ) < .0001);

  for (let count = 0; count < 30; count += 1) events.emit('brick:destroyed');
  assert.equal(ComboPlugin.scoreMultiplier(), GAME.combo.maximumMultiplier);

  ComboPlugin.afterUpdate(3.01, context);
  assert.equal(ComboPlugin.combo, 0);
  assert.equal(ComboPlugin.scoreMultiplier(), 1);
  assert.equal(ended, 1);
  ComboPlugin.dispose();
});
