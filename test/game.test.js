import assert from 'node:assert/strict';
import test from 'node:test';
import { EventBus } from '../src/core/EventBus.js';
import { Entity, World } from '../src/core/Entity.js';
import { GameEngine } from '../src/core/GameEngine.js';
import { BreakoutScene } from '../src/game/BreakoutScene.js';
import { GAME } from '../src/game/config.js';
import { calculateExpectedBrickHitPoints, selectBrickHitPoints } from '../src/game/systems/BrickFieldSystem.js';
import { ComboPlugin } from '../src/game/plugins/ComboPlugin.js';

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
  while (brick.active) events.emit('brick:hit', { brick, ball });
  scene.world.flush();
  assert.ok(scene.score >= 100);
  assert.equal(brick.active, false);

  ball.y = 700;
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

test('挡板每五秒自动发射一颗新球', () => {
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
  for (let index = 0; index < 650; index += 1) scene.update(1 / 120);
  assert.equal(launches, 2);
  scene.exit();
});

test('方块血量按可调公式随时间和分数无上限增长', () => {
  assert.equal(calculateExpectedBrickHitPoints({ elapsed: 0, score: 0 }), 1.4);
  assert.ok(calculateExpectedBrickHitPoints({ elapsed: 60, score: 0 }) > 2);
  assert.ok(calculateExpectedBrickHitPoints({ elapsed: 0, score: 5000 }) > 2);
  assert.ok(calculateExpectedBrickHitPoints({ elapsed: 600, score: 100000 }) > 15);
  assert.equal(selectBrickHitPoints({ elapsed: 0, score: 0 }, () => .5), 1);

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

  scene.upgrades.check(GAME.upgrade.scoreInterval);
  assert.equal(scene.state, 'upgrading');
  assert.equal(scene.chooseUpgrade('rapidFire'), true);
  assert.equal(scene.upgrades.levels.rapidFire, 1);
  assert.ok(scene.autoFire.interval < GAME.autoFireInterval);

  scene.upgrades.check(GAME.upgrade.scoreInterval * 2);
  scene.chooseUpgrade('multiShot');
  assert.equal(scene.upgrades.levels.multiShot, 1);
  const ballCount = scene.world.all('ball').length;
  scene.autoFire.random = () => 0;
  scene.autoFire.timeUntilShot = 0;
  scene.update(1 / 120);
  assert.equal(scene.world.all('ball').length, ballCount + 2);

  const ball = scene.world.first('ball');
  const speedBefore = Math.hypot(ball.velocityX, ball.velocityY);
  scene.upgrades.check(GAME.upgrade.scoreInterval * 3);
  scene.chooseUpgrade('ballSpeed');
  const speedAfter = Math.hypot(ball.velocityX, ball.velocityY);
  assert.ok(Math.abs(speedAfter / speedBefore - GAME.upgrade.ballSpeedMultiplierPerLevel) < .0001);

  scene.upgrades.check(GAME.upgrade.scoreInterval * 4);
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
  assert.equal(ComboPlugin.scoreMultiplier(), 1.25);

  ComboPlugin.afterUpdate(2.9, context);
  events.emit('brick:destroyed');
  assert.equal(ComboPlugin.combo, 3);
  assert.equal(ComboPlugin.scoreMultiplier(), 1.5);

  ComboPlugin.afterUpdate(3.01, context);
  assert.equal(ComboPlugin.combo, 0);
  assert.equal(ComboPlugin.scoreMultiplier(), 1);
  assert.equal(ended, 1);
  ComboPlugin.dispose();
});
