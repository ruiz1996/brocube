import assert from 'node:assert/strict';
import test from 'node:test';
import { EventBus } from '../src/core/EventBus.js';
import { Entity, World } from '../src/core/Entity.js';
import { GameEngine } from '../src/core/GameEngine.js';
import { InputManager, mapPointerToElement } from '../src/core/InputManager.js';
import { BreakoutScene } from '../src/game/BreakoutScene.js';
import { GAME } from '../src/game/config.js';
import { Brick } from '../src/game/entities/entities.js';
import {
  BOSS_SHAPE_IDS,
  calculateBrickSizeHealthMultiplier,
  calculateExpectedBrickHitPoints,
  createBossPolygon,
  selectBrickDimensions,
  selectBrickHitPoints,
  selectBossPolygon,
} from '../src/game/systems/BrickFieldSystem.js';
import { calculateUpgradeScoreCost } from '../src/game/systems/UpgradeSystem.js';
import { calculateUpgradeProgress } from '../src/ui/GameUI.js';
import { ComboPlugin } from '../src/game/plugins/ComboPlugin.js';
import {
  BASIC_BALL_ID,
  LIGHTNING_BALL_ID,
  MICRO_NAVIGATION_BALL_ID,
  VOID_ORBIT_BALL_ID,
  createDefaultBallDefinitions,
} from '../src/game/balls/BallDefinitionRegistry.js';
import { BallFactory } from '../src/game/balls/BallFactory.js';
import { getOrbiterTrail } from '../src/game/balls/Orbiter.js';
import { getBallLevelVisual } from '../src/game/balls/BallRendererRegistry.js';
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

test('生命增幅只强化新生成的球，最多可选择三级', () => {
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

test('攻击强化提升直接碰撞伤害但不影响技能伤害，并以低优先级出现', () => {
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
  scene.world.add(directBall);
  scene.world.add(lightningBall);
  scene.world.add(blastBall);
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
  assert.equal(
    lightningBall.damageEffects[0].config.damage,
    GAME.upgrade.lightningDamage,
  );

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
  const chainDamage = lightning.damageEffects[0].config.damage;
  for (let count = 0; count < 3; count += 1) killBrick(lightning, 'chain-lightning');
  assert.equal(lightning.level, 2);
  assert.equal(lightning.damage, 0);
  assert.equal(
    lightning.damageEffects[0].config.damage,
    chainDamage + GAME.ball.levelLightningDamageBonus,
  );
  assert.equal(
    lightning.damageEffects[0].config.additionalTargets,
    GAME.upgrade.lightningAdditionalTargets + GAME.ball.levelLightningTargetBonus,
  );
  assert.equal(lightning.lives, GAME.ball.defaultLives);
  for (let count = 3; count < 9; count += 1) killBrick(lightning, 'chain-lightning');
  assert.equal(lightning.level, 3);
  assert.equal(
    lightning.damageEffects[0].config.damage,
    chainDamage + GAME.ball.levelLightningDamageBonus * 2,
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
    blast.periodicEffects[0].config.damage,
    GAME.upgrade.blastDamage + GAME.ball.levelBlastDamageBonus,
  );
  assert.equal(
    blast.periodicEffects[0].config.radius,
    GAME.upgrade.blastRadius + GAME.ball.levelBlastRadiusBonus,
  );
  for (let count = 3; count < 9; count += 1) killBrick(blast, 'periodic-explosion');
  assert.equal(blast.level, 3);
  assert.equal(
    blast.periodicEffects[0].config.damage,
    GAME.upgrade.blastDamage + GAME.ball.levelBlastDamageBonus * 2,
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

test('双重挡板创建半宽同步副挡板，并参与球反弹', () => {
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
  assert.equal(secondary.width, primary.width * GAME.upgrade.doublePaddleWidthRatio);
  assert.equal(primary.y - secondary.y, GAME.upgrade.doublePaddleVerticalOffset);
  assert.equal(scene.upgrades.isAvailable('doublePaddle'), false);

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
  assert.deepEqual(
    scene.autoFire.availablePrimaryShots().map(({ shotType }) => shotType),
    expectedTypes,
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
  }
  assert.equal(scene.upgrades.isAvailable('navigationStrength'), false);

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

test('方块血量按可调公式随时间和分数无上限增长', () => {
  assert.equal(calculateExpectedBrickHitPoints({ elapsed: 0, score: 0 }), 14);
  assert.ok(calculateExpectedBrickHitPoints({ elapsed: 60, score: 0 }) > 20);
  assert.ok(calculateExpectedBrickHitPoints({ elapsed: 0, score: 5000 }) > 20);
  assert.ok(calculateExpectedBrickHitPoints({ elapsed: 600, score: 100000 }) > 150);
  assert.equal(selectBrickHitPoints({ elapsed: 0, score: 0 }, () => .5), 14);

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
  assert.equal(bosses[0].width, GAME.brick.bossWidth);
  assert.equal(bosses[0].height, GAME.brick.bossHeight);
  assert.ok(BOSS_SHAPE_IDS.includes(bosses[0].bossShape));
  assert.deepEqual(
    bosses[0].points,
    createBossPolygon(GAME.brick.bossWidth, GAME.brick.bossHeight, bosses[0].bossShape),
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
  assert.equal(scene.upgrades.newBallLives, 4);
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
  chooseDirectly('doublePaddle');
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
