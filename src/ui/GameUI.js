export class GameUI {
  constructor(engine, scene, audio) {
    this.engine = engine;
    this.scene = scene;
    this.audio = audio;
    this.score = document.querySelector('#score-value');
    this.balls = document.querySelector('#balls-value');
    this.shot = document.querySelector('#shot-value');
    this.overlay = document.querySelector('#game-overlay');
    this.kicker = document.querySelector('#overlay-kicker');
    this.title = document.querySelector('#overlay-title');
    this.copy = document.querySelector('#overlay-copy');
    this.primary = document.querySelector('#primary-button');
    this.primaryLabel = document.querySelector('#primary-button-label');
    this.upgradeOverlay = document.querySelector('#upgrade-overlay');
    this.upgradeOptions = document.querySelector('#upgrade-options');
    this.pauseButton = document.querySelector('#pause-button');
    this.soundButton = document.querySelector('#sound-button');
    this.#bind();
    this.updateStats(scene.snapshot());
  }

  #bind() {
    const { events } = this.engine;
    this.primary.addEventListener('click', () => {
      if (['idle', 'lost'].includes(this.scene.state)) this.scene.startNewGame();
      else if (this.engine.paused) this.engine.setPaused(false);
      this.#hideOverlay();
    });
    this.pauseButton.addEventListener('click', () => {
      if (this.scene.state === 'playing') this.engine.togglePause();
    });
    this.soundButton.addEventListener('click', () => {
      this.audio.setEnabled(!this.audio.enabled);
      this.soundButton.setAttribute('aria-pressed', String(this.audio.enabled));
    });
    this.upgradeOptions.addEventListener('click', (event) => {
      const option = event.target.closest('[data-upgrade-id]');
      if (option) this.scene.chooseUpgrade(option.dataset.upgradeId);
    });

    events.on('game:stats', (data) => this.updateStats(data));
    events.on('game:started', (data) => { this.updateStats(data); this.#hideOverlay(); this.#hideUpgrades(); });
    events.on('game:lost', (data) => { this.#hideUpgrades(); this.#showOverlay('DEFENSE BREACHED', '防线失守', `坚持了 ${this.#formatTime(data.elapsed)}，最终得分 ${String(Math.round(data.score)).padStart(6, '0')}。`, '重新开始'); });
    events.on('engine:paused', () => this.#showOverlay('SYSTEM PAUSED', '游戏暂停', '能量场已冻结，准备好后继续。', '继续游戏'));
    events.on('engine:resumed', () => { if (this.scene.state === 'playing') this.#hideOverlay(); });
    events.on('brick:destroyed', ({ brick }) => this.audio.play(260 + brick.maxHitPoints * 52, .04, .022));
    events.on('ball:bounce', ({ surface }) => this.audio.play(surface === 'paddle' ? 180 : 120, .025, .012));
    events.on('ball:launched', () => this.audio.play(340, .06, .018));
    events.on('brick:breached', () => this.audio.play(70, .28, .04));
    events.on('upgrade:offered', ({ options }) => this.#showUpgrades(options));
    events.on('upgrade:selected', ({ pendingChoices }) => {
      this.audio.play(520, .12, .035);
      if (pendingChoices === 0) this.#hideUpgrades();
    });
  }

  updateStats({ score, balls, nextShot }) {
    this.score.textContent = String(Math.round(score)).padStart(6, '0');
    this.balls.textContent = String(balls).padStart(2, '0');
    this.shot.textContent = `${Math.max(0, nextShot).toFixed(1)}s`;
  }

  #showOverlay(kicker, title, copy, buttonLabel) {
    this.kicker.textContent = kicker;
    this.title.textContent = title;
    this.copy.textContent = copy;
    this.primaryLabel.textContent = buttonLabel;
    this.overlay.classList.remove('is-hidden');
  }

  #hideOverlay() { this.overlay.classList.add('is-hidden'); }

  #showUpgrades(options) {
    this.upgradeOptions.innerHTML = options.map((option) => `
      <button class="upgrade-card" type="button" data-upgrade-id="${option.id}">
        <span class="upgrade-level">LV.${String(option.level).padStart(2, '0')}</span>
        <span class="upgrade-name">${option.name}</span>
        <span class="upgrade-description">${option.description}</span>
        <span class="upgrade-action">选择强化 →</span>
      </button>
    `).join('');
    this.upgradeOverlay.classList.remove('is-hidden');
    this.upgradeOverlay.setAttribute('aria-hidden', 'false');
  }

  #hideUpgrades() {
    this.upgradeOverlay.classList.add('is-hidden');
    this.upgradeOverlay.setAttribute('aria-hidden', 'true');
  }

  #formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const remainder = Math.floor(seconds % 60);
    return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
  }
}
