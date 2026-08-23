export const COLLECTIBLE_QUALITIES = Object.freeze({
  common: Object.freeze({ id: 'common', name: '普通', color: '#63d7ff' }),
  rare: Object.freeze({ id: 'rare', name: '稀有', color: '#8b7cff' }),
  epic: Object.freeze({ id: 'epic', name: '史诗', color: '#d760dc' }),
  legendary: Object.freeze({ id: 'legendary', name: '传说', color: '#ffad5a' }),
});

const collectible = (definition) => Object.freeze({
  category: 'combat',
  maxLevel: 10,
  ...definition,
});

export const COLLECTIBLE_CATALOG = Object.freeze([
  collectible({
    id: 'photon-whetstone', name: '光蚀砺石', quality: 'common', icon: 'sun-core',
    maxLevel: Infinity, effect: '所有球基础伤害每级 +1%。',
  }),
  collectible({
    id: 'dawn-calibrator', name: '黎明校准器', quality: 'common', icon: 'crosshair',
    maxLevel: Infinity, effect: '所有球基础伤害每级 +1%。',
  }),
  collectible({
    id: 'assault-prism', name: '强袭棱核', quality: 'rare', icon: 'prism',
    effect: '所有球基础伤害每级 +3。',
  }),
  collectible({
    id: 'starforge-heart', name: '星铸心脏', quality: 'epic', icon: 'heart-core',
    maxLevel: 5, effect: '所有球基础伤害每级 +5。',
  }),
  collectible({
    id: 'secondhand-compressor', name: '秒针压缩器', quality: 'common', icon: 'clock',
    maxLevel: 5, category: 'launch', effect: '每级使自动发射间隔缩短 1.5%。',
  }),
  collectible({
    id: 'warp-escapement', name: '折跃擒纵轮', quality: 'rare', icon: 'gear',
    maxLevel: 2, category: 'launch', effect: '每级使自动发射间隔缩短 4%。',
  }),
  collectible({
    id: 'zero-hour-hourglass', name: '零时沙漏', quality: 'epic', icon: 'hourglass',
    maxLevel: 1, category: 'launch', effect: '使自动发射间隔缩短 10%。',
  }),
  collectible({
    id: 'mirror-launch-spring', name: '镜像发射簧', quality: 'common', icon: 'split-arrow',
    category: 'launch', effect: '每级增加 2% 概率额外发射一个独立球；额外球也能抽取特殊球。',
  }),
  collectible({
    id: 'extension-keel', name: '延展龙骨', quality: 'common', icon: 'wide-bar',
    maxLevel: 5, category: 'defense', effect: '每级增加挡板基础宽度 2.5%。',
  }),
  collectible({
    id: 'return-membrane', name: '归航薄膜', quality: 'common', icon: 'return-arc',
    category: 'defense', effect: '每级增加 2% 独立底线保留概率，与底线回响分别判定。',
  }),
  collectible({
    id: 'hunter-calculus', name: '猎杀演算芯', quality: 'rare', icon: 'target-chip',
    category: 'growth', effect: '球击杀方块时，每级增加 5% 概率额外获得一次球升级进度。',
  }),
  collectible({
    id: 'ascension-memory-core', name: '升格记忆核', quality: 'epic', icon: 'ascension-core',
    category: 'growth', effect: '每级使球获得的升级经验增加 5%。',
  }),
  collectible({
    id: 'recoil-capacitor', name: '反冲蓄能板', quality: 'common', icon: 'bounce',
    category: 'combat', effect: '球经过挡板反弹后，每级额外增加 10% 下一击伤害；不可叠加。',
  }),
  collectible({
    id: 'zenith-velocimeter', name: '天穹测速仪', quality: 'rare', icon: 'comet',
    category: 'special', effect: '每级增加天顶增援 5% 速度转伤害倍率。',
  }),
  collectible({
    id: 'fusion-shock-ring', name: '聚爆震荡环', quality: 'rare', icon: 'blast-ring',
    category: 'special', effect: '每级使爆裂核心爆炸伤害 +3、范围 +10。',
  }),
  collectible({
    id: 'gravity-dial', name: '引力刻度盘', quality: 'rare', icon: 'orbit',
    category: 'special', effect: '每级增加虚空子球 2% 旋转半径和 2% 旋转速度。',
  }),
  collectible({
    id: 'starhunter-lens', name: '猎星透镜', quality: 'rare', icon: 'navigation',
    category: 'special', effect: '每级增加微导航球 5% 基础伤害。',
  }),
  collectible({
    id: 'thunder-echo-vial', name: '雷鸣回声瓶', quality: 'rare', icon: 'lightning-vial',
    category: 'special', effect: '每级增加 5% 回响概率；闪电链和雷击分别独立判定。',
  }),
  collectible({
    id: 'expedition-star-chart', name: '远征星图', quality: 'legendary', icon: 'star-map',
    category: 'reward', effect: '每级增加 5% Boss 额外掉落一个收集箱的概率。',
  }),
  collectible({
    id: 'paddle-crystal-wing', name: '晶翼拦截器', quality: 'epic', icon: 'paddle-wing',
    maxLevel: 1, category: 'paddle', paddleStyle: 'crystal-wing', effect: '解锁晶体双翼造型挡板，仅改变外观。',
  }),
  collectible({
    id: 'paddle-crescent', name: '断星月刃', quality: 'epic', icon: 'paddle-crescent',
    maxLevel: 1, category: 'paddle', paddleStyle: 'star-crescent', effect: '解锁弧月刀锋造型挡板，仅改变外观。',
  }),
  collectible({
    id: 'paddle-prism-ark', name: '棱镜方舟', quality: 'epic', icon: 'paddle-ark',
    maxLevel: 1, category: 'paddle', paddleStyle: 'prism-ark', effect: '解锁装甲方舟造型挡板，仅改变外观。',
  }),
  collectible({
    id: 'paddle-void-spine', name: '虚空脊刃', quality: 'epic', icon: 'paddle-spine',
    maxLevel: 1, category: 'paddle', paddleStyle: 'void-spine', effect: '解锁虚空分段造型挡板，仅改变外观。',
  }),
]);

const CATALOG_BY_ID = new Map(COLLECTIBLE_CATALOG.map((entry) => [entry.id, entry]));

export function getCollectible(id) {
  return CATALOG_BY_ID.get(id) ?? null;
}

export function collectibleQuality(id) {
  return COLLECTIBLE_QUALITIES[id] ?? COLLECTIBLE_QUALITIES.common;
}
