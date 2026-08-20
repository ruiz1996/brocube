import { GameEngine } from './core/GameEngine.js';
import { GAME } from './game/config.js';
import { BreakoutScene } from './game/BreakoutScene.js';
import { AudioService } from './game/AudioService.js';
import { ComboPlugin } from './game/plugins/ComboPlugin.js';
import { GameUI } from './ui/GameUI.js';

const canvas = document.querySelector('#game-canvas');
const pointerTargets = [
  canvas,
  document.querySelector('#control-bar'),
  document.querySelector('#touch-tip'),
];
const engine = new GameEngine({ canvas, width: GAME.width, height: GAME.height, pointerTargets });
const scene = new BreakoutScene();

engine.plugins.use(ComboPlugin);
engine.setScene(scene);
new GameUI(engine, scene, new AudioService());
engine.start();

// 仅用于开发调试与后续玩法模块接入，不依赖这个全局变量运行。
window.breakout = { engine, scene };
