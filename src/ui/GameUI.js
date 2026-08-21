import { GAME } from '../game/config.js';

export function calculateUpgradeProgress({ score, progressStart, nextScore }) {
  const start = Math.max(0, progressStart ?? 0);
  const target = Math.max(start + 1, nextScore ?? start + 1);
  const required = target - start;
  const earned = Math.max(0, Math.min(required, score - start));
  return { earned, required, ratio: earned / required };
}

export class GameUI {
  constructor(engine, scene, audio) {
    this.engine = engine;
    this.scene = scene;
    this.audio = audio;
    this.score = document.querySelector('#score-value');
    this.balls = document.querySelector('#balls-value');
    this.shot = document.querySelector('#shot-value');
    this.upgradeProgressTrack = document.querySelector('#upgrade-progress-track');
    this.upgradeProgressFill = document.querySelector('#upgrade-progress-fill');
    this.upgradeProgressValue = document.querySelector('#upgrade-progress-value');
    this.overlay = document.querySelector('#game-overlay');
    this.kicker = document.querySelector('#overlay-kicker');
    this.title = document.querySelector('#overlay-title');
    this.copy = document.querySelector('#overlay-copy');
    this.primary = document.querySelector('#primary-button');
    this.primaryLabel = document.querySelector('#primary-button-label');
    this.upgradeOverlay = document.querySelector('#upgrade-overlay');
    this.upgradeOptions = document.querySelector('#upgrade-options');
    this.upgradeToast = document.querySelector('#upgrade-toast');
    this.upgradeToastKicker = document.querySelector('#upgrade-toast-kicker');
    this.upgradeToastName = document.querySelector('#upgrade-toast-name');
    this.upgradeToastLevel = document.querySelector('#upgrade-toast-level');
    this.comboIndicator = document.querySelector('#combo-indicator');
    this.comboCount = document.querySelector('#combo-count');
    this.comboMultiplier = document.querySelector('#combo-multiplier');
    this.pauseButton = document.querySelector('#pause-button');
    this.soundButton = document.querySelector('#sound-button');
    this.upgradeLibraryButton = document.querySelector('#upgrade-library-button');
    this.upgradeLibrary = document.querySelector('#upgrade-library');
    this.upgradeLibraryClose = document.querySelector('#upgrade-library-close');
    this.upgradeLibraryList = document.querySelector('#upgrade-library-list');
    this.resumeAfterLibrary = false;
    this.upgradeToastTimer = null;
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
    this.upgradeLibraryButton.addEventListener('click', () => this.#showUpgradeLibrary());
    this.upgradeLibraryClose.addEventListener('click', () => this.#hideUpgradeLibrary());
    this.upgradeLibrary.addEventListener('click', (event) => {
      if (event.target === this.upgradeLibrary) this.#hideUpgradeLibrary();
    });
    this.upgradeLibraryList.addEventListener('change', (event) => {
      const checkbox = event.target.closest('[data-auto-upgrade-id]');
      if (!checkbox) return;
      this.scene.upgrades.setAutoUpgrade(checkbox.dataset.autoUpgradeId, checkbox.checked);
      this.#renderUpgradeLibrary();
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
    events.on('brick:destroyed', ({ brick }) => this.audio.play(
      260 + brick.maxHitPoints / GAME.combat.valueScale * 52,
      .04,
      .022,
    ));
    events.on('ball:bounce', ({ surface }) => this.audio.play(surface === 'paddle' ? 180 : 120, .025, .012));
    events.on('ball:launched', () => this.audio.play(340, .06, .018));
    events.on('brick:breached', () => this.audio.play(70, .28, .04));
    events.on('upgrade:offered', ({ options }) => this.#showUpgrades(options));
    events.on('upgrade:selected', ({ name, level, maxLevel, automatic, pendingChoices }) => {
      this.audio.play(520, .12, .035);
      this.#showUpgradeToast({ name, level, maxLevel, automatic });
      if (pendingChoices === 0) this.#hideUpgrades();
      if (!this.upgradeLibrary.classList.contains('is-hidden')) this.#renderUpgradeLibrary();
    });
    events.on('upgrade:auto-changed', () => {
      if (!this.upgradeLibrary.classList.contains('is-hidden')) this.#renderUpgradeLibrary();
    });
    events.on('combo:changed', (combo) => this.#updateCombo(combo));
    events.on('combo:ended', () => this.#hideCombo());
  }

  updateStats({ score, balls, nextShot, upgradeProgressStart = 0, nextUpgradeScore }) {
    this.score.textContent = String(Math.round(score)).padStart(6, '0');
    this.balls.textContent = String(balls).padStart(2, '0');
    this.shot.textContent = `${Math.max(0, nextShot).toFixed(1)}s`;
    const progress = calculateUpgradeProgress({
      score,
      progressStart: upgradeProgressStart,
      nextScore: nextUpgradeScore,
    });
    this.upgradeProgressFill.style.transform = `scaleX(${progress.ratio})`;
    this.upgradeProgressValue.textContent = `${Math.round(progress.earned)} / ${Math.round(progress.required)}`;
    this.upgradeProgressTrack.setAttribute('aria-valuenow', String(Math.round(progress.ratio * 100)));
    this.upgradeProgressTrack.setAttribute(
      'aria-valuetext',
      `距离下次强化：${Math.round(progress.earned)} / ${Math.round(progress.required)} 分`,
    );
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
        <span class="upgrade-level">LV.${String(option.level).padStart(2, '0')} → LV.${String(option.level + 1).padStart(2, '0')}</span>
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

  #showUpgradeToast({ name, level, maxLevel, automatic }) {
    if (!this.upgradeToast) return;
    const maximum = Number.isFinite(maxLevel) ? ` / ${String(maxLevel).padStart(2, '0')}` : '';
    this.upgradeToastKicker.textContent = automatic ? 'AUTO UPGRADE APPLIED' : 'UPGRADE APPLIED';
    this.upgradeToastName.textContent = name;
    this.upgradeToastLevel.textContent = `已升至 LV.${String(level).padStart(2, '0')}${maximum}`;
    this.upgradeToast.classList.remove('is-hidden', 'is-pulsing');
    void this.upgradeToast.offsetWidth;
    this.upgradeToast.classList.add('is-pulsing');
    clearTimeout(this.upgradeToastTimer);
    this.upgradeToastTimer = setTimeout(() => {
      this.upgradeToast.classList.add('is-hidden');
      this.upgradeToast.classList.remove('is-pulsing');
    }, 1800);
  }

  #showUpgradeLibrary() {
    this.resumeAfterLibrary = this.scene.state === 'playing' && !this.engine.paused;
    if (this.resumeAfterLibrary) this.engine.setPaused(true);
    this.#renderUpgradeLibrary();
    this.upgradeLibrary.classList.remove('is-hidden');
    this.upgradeLibrary.setAttribute('aria-hidden', 'false');
    this.upgradeLibraryButton.setAttribute('aria-expanded', 'true');
  }

  #hideUpgradeLibrary() {
    this.upgradeLibrary.classList.add('is-hidden');
    this.upgradeLibrary.setAttribute('aria-hidden', 'true');
    this.upgradeLibraryButton.setAttribute('aria-expanded', 'false');
    if (this.resumeAfterLibrary && this.scene.state === 'playing') this.engine.setPaused(false);
    this.resumeAfterLibrary = false;
  }

  #renderUpgradeLibrary() {
    const cards = this.scene.upgrades.catalogState();
    this.upgradeLibraryList.innerHTML = cards.map((card) => {
      const maximum = Number.isFinite(card.maxLevel) ? card.maxLevel : '∞';
      const status = card.capped
        ? '已满级'
        : card.prerequisiteMet ? '可进入随机池' : (card.prerequisiteText ?? '需要先解锁前置强化');
      return `
        <label class="upgrade-library-card${card.capped ? ' is-capped' : ''}${card.prerequisiteMet ? '' : ' is-locked'}">
          <span class="upgrade-library-card-head">
            <span class="upgrade-name">${card.name}</span>
            <span class="upgrade-level">LV.${card.level} / ${maximum}</span>
          </span>
          <span class="upgrade-description">${card.description}</span>
          <span class="upgrade-library-card-foot">
            <span class="upgrade-library-status">${status}</span>
            <span class="auto-upgrade-toggle">
              <input type="checkbox" data-auto-upgrade-id="${card.id}" ${card.autoSelected ? 'checked' : ''}>
              <span>自动升级</span>
            </span>
          </span>
        </label>
      `;
    }).join('');
  }

  #updateCombo({ count, multiplier, windowSeconds }) {
    if (count < 2) { this.#hideCombo(); return; }
    this.comboCount.textContent = `${count} COMBO`;
    this.comboMultiplier.textContent = `×${multiplier.toFixed(2)} SCORE`;
    this.comboIndicator.style.setProperty('--combo-window', `${windowSeconds}s`);
    const timer = this.comboIndicator.querySelector('.combo-timer');
    timer.style.animationDuration = `${windowSeconds}s`;
    timer.style.animationName = 'none';
    this.comboIndicator.classList.remove('is-hidden', 'is-pulsing');
    void timer.offsetWidth;
    timer.style.animationName = 'combo-drain';
    this.comboIndicator.classList.add('is-pulsing');
  }

  #hideCombo() { this.comboIndicator.classList.add('is-hidden'); }

  #formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const remainder = Math.floor(seconds % 60);
    return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
  }
}
