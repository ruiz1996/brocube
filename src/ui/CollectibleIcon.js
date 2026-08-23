import { collectibleQuality } from '../game/collectibles/CollectibleCatalog.js';

const SYMBOLS = Object.freeze({
  'sun-core': '<circle cx="32" cy="32" r="10"/><path d="M32 8v10M32 46v10M8 32h10M46 32h10M15 15l7 7M42 42l7 7M49 15l-7 7M22 42l-7 7"/>',
  crosshair: '<circle cx="32" cy="32" r="17"/><circle cx="32" cy="32" r="5"/><path d="M32 7v14M32 43v14M7 32h14M43 32h14"/>',
  prism: '<path d="M32 8l21 39-21 9-21-9z"/><path d="M32 8v48M11 47l21-15 21 15"/>',
  'heart-core': '<path d="M32 54S11 42 11 24c0-12 15-16 21-5 6-11 21-7 21 5 0 18-21 30-21 30z"/><path d="M24 31h5l3-8 4 17 3-9h6"/>',
  clock: '<circle cx="32" cy="32" r="22"/><path d="M32 16v17l11 7M25 7h14"/>',
  gear: '<path d="M27 8h10l2 7 7 3 7-3 5 9-5 5v7l5 5-5 9-7-3-7 3-2 7H27l-2-7-7-3-7 3-5-9 5-5v-7l-5-5 5-9 7 3 7-3z"/><circle cx="32" cy="32" r="8"/>',
  hourglass: '<path d="M17 8h30M17 56h30M20 9c0 13 3 17 12 23-9 6-12 10-12 23M44 9c0 13-3 17-12 23 9 6 12 10 12 23"/><path d="M25 48h14l-7-8z"/>',
  'split-arrow': '<path d="M14 48V32h17c8 0 11-7 11-15M34 17h8v8M31 32c8 0 11 7 11 15M34 47h8v-8"/>',
  'wide-bar': '<path d="M8 25h48v14H8z"/><path d="M8 18v28M56 18v28M16 32h32"/>',
  'return-arc': '<path d="M49 45A20 20 0 1 0 15 23M15 12v11h11"/><path d="M26 49l6 7 6-7"/>',
  'target-chip': '<path d="M15 15h34v34H15z"/><circle cx="32" cy="32" r="10"/><circle cx="32" cy="32" r="3"/><path d="M8 22h7M8 32h7M8 42h7M49 22h7M49 32h7M49 42h7"/>',
  'ascension-core': '<path d="M32 7l14 12-6 30-8 8-8-8-6-30z"/><path d="M32 7v50M18 19l14 9 14-9M24 49l8-12 8 12"/><path d="M10 39l7-7 7 7M40 39l7-7 7 7"/>',
  bounce: '<path d="M9 47h46M15 39c10 0 9-24 20-24 8 0 10 12 17 12"/><path d="M45 20l7 7-9 5"/>',
  comet: '<circle cx="43" cy="21" r="9"/><path d="M36 28L12 52M32 22L8 37M42 32L27 56"/>',
  'blast-ring': '<circle cx="32" cy="32" r="9"/><circle cx="32" cy="32" r="19"/><path d="M32 5v9M32 50v9M5 32h9M50 32h9"/>',
  orbit: '<circle cx="32" cy="32" r="6"/><ellipse cx="32" cy="32" rx="25" ry="12" transform="rotate(-22 32 32)"/><circle cx="53" cy="23" r="4"/>',
  navigation: '<path d="M10 52l15-40 9 18 20 9z"/><circle cx="39" cy="24" r="5"/><path d="M32 32l-9 17"/>',
  'lightning-vial': '<path d="M23 8h18M26 9v12L18 48c-2 6 3 9 8 9h12c5 0 10-3 8-9l-8-27V9"/><path d="M34 24l-8 13h7l-3 13 10-17h-7z"/>',
  'star-map': '<path d="M9 14l14-5 18 6 14-5v40l-14 5-18-6-14 5z"/><path d="M23 9v40M41 15v40"/><path d="M31 23l3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z"/>',
  'paddle-wing': '<path d="M7 43l9-20 16 9 16-9 9 20-19-5-6 12-6-12z"/>',
  'paddle-crescent': '<path d="M7 40q25-30 50 0-25 18-50 0z"/><path d="M18 38q14-13 28 0"/>',
  'paddle-ark': '<path d="M7 44l7-19h13l5 6 5-6h13l7 19z"/><path d="M32 30l7 8-7 8-7-8z"/>',
  'paddle-spine': '<path d="M6 40h10l3-10 7 10 6-14 6 14 7-10 3 10h10"/><path d="M8 47h48"/>',
});

export function renderCollectibleIcon(definition) {
  const quality = collectibleQuality(definition.quality);
  const symbol = SYMBOLS[definition.icon] ?? SYMBOLS.prism;
  return `<svg class="collectible-icon" viewBox="0 0 64 64" role="img" aria-label="${definition.name}" style="--item-color:${quality.color}">
    <defs><radialGradient id="glow-${definition.id}" cx="50%" cy="45%" r="65%"><stop offset="0" stop-color="${quality.color}" stop-opacity=".32"/><stop offset="1" stop-color="${quality.color}" stop-opacity="0"/></radialGradient></defs>
    <circle class="collectible-icon-glow" cx="32" cy="32" r="30" fill="url(#glow-${definition.id})"/>
    <g fill="none" stroke="${quality.color}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${symbol}</g>
  </svg>`;
}
