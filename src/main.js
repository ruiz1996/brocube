import { GameEngine } from './core/GameEngine.js';
import { GAME } from './game/config.js';
import { BreakoutScene } from './game/BreakoutScene.js';
import { AudioService } from './game/AudioService.js';
import { ComboPlugin } from './game/plugins/ComboPlugin.js';
import { PlayerLeaderboardService } from './online/PlayerLeaderboardService.js';
import { GameUI } from './ui/GameUI.js';
import { PlayerLeaderboardUI } from './ui/PlayerLeaderboardUI.js';
import { CollectibleInventory } from './game/collectibles/CollectibleInventory.js';
import { CollectibleUI } from './ui/CollectibleUI.js';
import { WorldProgression } from './game/WorldProgression.js';

const canvas = document.querySelector('#game-canvas');
const pointerTargets = [
  canvas,
  document.querySelector('#control-bar'),
  document.querySelector('#touch-tip'),
];
const engine = new GameEngine({ canvas, width: GAME.width, height: GAME.height, pointerTargets });
const scene = new BreakoutScene();
const collectibleInventory = new CollectibleInventory({ events: engine.events });
const worldProgression = new WorldProgression({ events: engine.events });
scene.collectibles = collectibleInventory;
scene.worldProgression = worldProgression;

engine.plugins.use(ComboPlugin);
engine.setScene(scene);
new GameUI(engine, scene, new AudioService());
new CollectibleUI(engine, scene, collectibleInventory);
const playerService = new PlayerLeaderboardService();
const playerUI = new PlayerLeaderboardUI(engine, scene, playerService);
playerUI.initialize();
engine.start();

// 仅用于开发调试与后续玩法模块接入，不依赖这个全局变量运行。
window.breakout = {
  engine,
  scene,
  playerService,
  collectibleInventory,
  worldProgression,
};
