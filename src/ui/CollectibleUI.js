import {
  COLLECTIBLE_CATALOG,
  COLLECTIBLE_QUALITIES,
  collectibleQuality,
} from '../game/collectibles/CollectibleCatalog.js';
import { renderCollectibleIcon } from './CollectibleIcon.js';

const FILTERS = Object.freeze([
  ['all', '全部'],
  ['common', '普通'],
  ['rare', '稀有'],
  ['epic', '史诗'],
  ['legendary', '传说'],
  ['paddle', '挡板'],
]);

export class CollectibleUI {
  constructor(engine, scene, inventory) {
    this.engine = engine;
    this.scene = scene;
    this.inventory = inventory;
    this.button = document.querySelector('#collectible-library-button');
    this.panel = document.querySelector('#collectible-library');
    this.closeButton = document.querySelector('#collectible-library-close');
    this.filters = document.querySelector('#collectible-filters');
    this.list = document.querySelector('#collectible-library-list');
    this.summary = document.querySelector('#collectible-summary');
    this.chestCount = document.querySelector('#collectible-chest-count');
    this.chestOpen = document.querySelector('#collectible-chest-open');
    this.chestReveal = document.querySelector('#collectible-chest-reveal');
    this.lastOpened = null;
    this.activeFilter = 'all';
    this.resumeAfterPanel = false;
    this.#bind();
    this.#renderFilters();
    this.render();
  }

  #bind() {
    this.button.addEventListener('click', () => this.show());
    this.closeButton.addEventListener('click', () => this.hide());
    this.chestOpen.addEventListener('click', () => {
      const result = this.scene.openCollectibleChest();
      if (!result) return;
      this.lastOpened = result;
      this.render();
    });
    this.panel.addEventListener('click', (event) => {
      if (event.target === this.panel) this.hide();
      const filter = event.target.closest('[data-collectible-filter]');
      if (filter) {
        this.activeFilter = filter.dataset.collectibleFilter;
        this.#renderFilters();
        this.render();
      }
      const paddleButton = event.target.closest('[data-paddle-collectible]');
      if (!paddleButton) return;
      const item = COLLECTIBLE_CATALOG.find(({ id }) => id === paddleButton.dataset.paddleCollectible);
      if (!item?.paddleStyle) return;
      if (this.inventory.level(item.id) > 0) {
        this.inventory.equipPaddle(item.id);
        this.scene.paddlePreviewStyle = null;
      } else {
        this.scene.paddlePreviewStyle = this.scene.paddlePreviewStyle === item.paddleStyle
          ? null
          : item.paddleStyle;
      }
      this.render();
    });
    this.engine.events.on('collectible:changed', () => this.render());
    this.engine.events.on('collectible:chests-changed', () => this.render());
    this.engine.events.on('collectible:chest-opened', (result) => {
      this.lastOpened = result;
      this.render();
    });
    this.engine.events.on('paddle-style:changed', () => this.render());
  }

  show() {
    this.resumeAfterPanel = this.scene.state === 'playing' && !this.engine.paused;
    if (this.resumeAfterPanel) this.engine.setPaused(true);
    this.render();
    this.panel.classList.remove('is-hidden');
    this.panel.setAttribute('aria-hidden', 'false');
    this.button.setAttribute('aria-expanded', 'true');
  }

  hide() {
    this.scene.paddlePreviewStyle = null;
    this.panel.classList.add('is-hidden');
    this.panel.setAttribute('aria-hidden', 'true');
    this.button.setAttribute('aria-expanded', 'false');
    if (this.resumeAfterPanel && this.scene.state === 'playing') this.engine.setPaused(false);
    this.resumeAfterPanel = false;
  }

  render() {
    const state = this.inventory.catalogState();
    const visible = state.filter((item) => (
      this.activeFilter === 'all'
      || item.quality === this.activeFilter
      || (this.activeFilter === 'paddle' && item.category === 'paddle')
    ));
    const owned = state.filter(({ owned }) => owned).length;
    this.summary.textContent = `已发现 ${owned} / ${state.length} · 数值收集品 ${state.length - 4} · 史诗挡板 4`;
    this.chestCount.textContent = String(this.inventory.chests);
    this.chestOpen.disabled = this.inventory.chests <= 0;
    this.chestOpen.textContent = this.inventory.chests > 0 ? '开启 1 个' : '暂无箱子';
    this.#renderChestReveal();
    this.list.innerHTML = visible.map((item) => this.#card(item)).join('');
  }

  #renderChestReveal() {
    if (!this.lastOpened) {
      this.chestReveal.classList.add('is-hidden');
      this.chestReveal.innerHTML = '';
      return;
    }
    const { collectible, level } = this.lastOpened;
    const quality = collectibleQuality(collectible.quality);
    this.chestReveal.style.setProperty('--item-color', quality.color);
    this.chestReveal.innerHTML = `
      <div class="collectible-chest-reveal-art">${renderCollectibleIcon(collectible)}</div>
      <div>
        <span>${quality.name} · 抽取成功</span>
        <strong>${collectible.name}</strong>
        <small>当前等级 LV.${level}${Number.isFinite(collectible.maxLevel) ? ` / ${collectible.maxLevel}` : ' / ∞'}</small>
      </div>
    `;
    this.chestReveal.classList.remove('is-hidden');
  }

  #renderFilters() {
    this.filters.innerHTML = FILTERS.map(([id, label]) => `
      <button class="collectible-filter${id === this.activeFilter ? ' is-active' : ''}" type="button" data-collectible-filter="${id}">${label}</button>
    `).join('');
  }

  #card(item) {
    const quality = collectibleQuality(item.quality);
    const maximum = Number.isFinite(item.maxLevel) ? item.maxLevel : '∞';
    const paddleAction = item.paddleStyle ? `
      <button class="collectible-preview-button" type="button" data-paddle-collectible="${item.id}">
        ${item.owned ? (item.equipped ? '已装备' : '装备') : (this.scene.paddlePreviewStyle === item.paddleStyle ? '取消预览' : '预览造型')}
      </button>
    ` : '';
    return `
      <article class="collectible-card${item.owned ? ' is-owned' : ' is-undiscovered'}" style="--item-color:${quality.color}">
        <div class="collectible-art">${renderCollectibleIcon(item)}</div>
        <div class="collectible-card-body">
          <div class="collectible-card-head">
            <span class="collectible-quality">${quality.name}</span>
            <span class="collectible-level">LV.${item.level} / ${maximum}</span>
          </div>
          <h3>${item.name}</h3>
          <p>${item.effect}</p>
          <div class="collectible-card-foot">
            <span>${item.owned ? (item.capped ? '已满级' : '已收录') : '尚未获得'}</span>
            ${paddleAction}
          </div>
        </div>
      </article>
    `;
  }
}
