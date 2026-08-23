import { BALL_TRAITS, normalizeTraits } from './BallTraits.js';
import {
  BASIC_BALL_ID,
  LIGHTNING_BALL_ID,
  MICRO_NAVIGATION_BALL_ID,
  VOID_ORBIT_BALL_ID,
} from './BallDefinitionRegistry.js';
import { GAME } from '../config.js';

export const FUSION_BALL_IDS = Object.freeze({
  TOP_BLAST: 'starfall-blast',
  TOP_VOID: 'zenith-void',
  TOP_NAVIGATION: 'zenith-hunter',
  TOP_LIGHTNING: 'zenith-thunder',
  BLAST_VOID: 'annihilation-ring',
  BLAST_NAVIGATION: 'hunter-bomb',
  BLAST_LIGHTNING: 'thunder-blast',
  VOID_NAVIGATION: 'gravity-hunters',
  VOID_LIGHTNING: 'storm-stars',
  NAVIGATION_LIGHTNING: 'thunder-tracker',
});

export const FUSION_BALL_CATALOG = Object.freeze([
  {
    id: FUSION_BALL_IDS.TOP_BLAST, name: '星陨爆核', components: ['top-launch', 'blast-core'],
    description: '从顶部高速降临，并保留周期爆炸与碰撞爆炸。',
  },
  {
    id: FUSION_BALL_IDS.TOP_VOID, name: '天穹双星', components: ['top-launch', 'void-orbit'],
    description: '顶部发射虚空核心，由两颗天顶子球承担高速碰撞伤害。',
  },
  {
    id: FUSION_BALL_IDS.TOP_NAVIGATION, name: '天谴追猎', components: ['top-launch', 'micro-navigation'],
    description: '从顶部高速降临，并持续修正轨迹追踪附近目标。',
  },
  {
    id: FUSION_BALL_IDS.TOP_LIGHTNING, name: '霆落天罚', components: ['top-launch', 'chain-lightning'],
    description: '从顶部高速降临，以闪电链代替常规碰撞伤害。',
  },
  {
    id: FUSION_BALL_IDS.BLAST_VOID, name: '湮灭星环', components: ['blast-core', 'void-orbit'],
    description: '两颗爆裂子球错峰爆炸，并可在子球碰撞时触发爆炸。',
  },
  {
    id: FUSION_BALL_IDS.BLAST_NAVIGATION, name: '追猎爆弹', components: ['blast-core', 'micro-navigation'],
    description: '主动修正轨迹追击目标的周期爆裂球。',
  },
  {
    id: FUSION_BALL_IDS.BLAST_LIGHTNING, name: '雷爆核心', components: ['blast-core', 'chain-lightning'],
    description: '周期制造范围爆炸，碰撞时同时释放闪电链。',
  },
  {
    id: FUSION_BALL_IDS.VOID_NAVIGATION, name: '引力双星', components: ['void-orbit', 'micro-navigation'],
    description: '导航子球会脱离轨道突进目标，然后返回虚空核心。',
  },
  {
    id: FUSION_BALL_IDS.VOID_LIGHTNING, name: '磁暴双星', components: ['void-orbit', 'chain-lightning'],
    description: '两颗闪电子球分别在接触目标时释放闪电链。',
  },
  {
    id: FUSION_BALL_IDS.NAVIGATION_LIGHTNING, name: '雷矢追踪', components: ['micro-navigation', 'chain-lightning'],
    description: '主动追踪目标，并在碰撞时释放闪电链。',
  },
]);

const fusionLayer = (primary, secondary, style) => ({
  id: 'fusion-signature',
  phase: 'overlay',
  config: { primary, secondary, style },
});

function voidPayload(scene, type, overrides = {}) {
  const upgrades = scene?.upgrades;
  const base = {
    type,
    traits: [],
    contactDamage: true,
    damageMultiplier: 1,
    damageEffects: [],
    periodicEffects: [],
    guidance: null,
  };
  if (type === 'zenith') {
    Object.assign(base, {
      traits: [BALL_TRAITS.TOP_LAUNCH],
      damageMultiplier: upgrades?.topImpactDamageMultiplier ?? 1,
    });
  } else if (type === 'blast') {
    const interval = upgrades?.blastInterval ?? GAME.upgrade.blastInterval;
    const blastConfig = {
      radius: GAME.upgrade.blastRadius,
      damage: GAME.upgrade.blastDamage,
      baseDamageScale: GAME.upgrade.blastDamage / GAME.combat.baseDamage,
      damageType: 'explosive',
      color: '#ff4fa3',
      secondaryColor: '#9b6cff',
    };
    Object.assign(base, {
      traits: [BALL_TRAITS.BLAST_CORE],
      periodicEffects: [{
        id: 'area-blast', interval, initialDelay: interval,
        config: blastConfig,
      }],
      damageEffects: (upgrades?.levels?.blastImpact ?? 0) > 0 ? [{
        id: 'impact-blast',
        config: { ...blastConfig, chance: upgrades.blastImpactChance },
      }] : [],
    });
  } else if (type === 'navigation') {
    Object.assign(base, {
      traits: [BALL_TRAITS.MICRO_NAVIGATION],
      guidance: {
        strength: upgrades?.navigationStrength ?? GAME.upgrade.navigationStrength,
        range: GAME.upgrade.navigationRange,
        returnStrikeChance: upgrades?.navigationReturnChance ?? 0,
        returnStrikeChainDecay: GAME.upgrade.navigationReturnChainDecay,
      },
    });
  } else if (type === 'lightning') {
    Object.assign(base, {
      traits: [BALL_TRAITS.CHAIN_LIGHTNING],
      contactDamage: false,
      damageEffects: [{
        id: 'chain-lightning',
        config: {
          damage: GAME.upgrade.lightningDamage,
          baseDamageScale: GAME.upgrade.lightningDamage / GAME.combat.baseDamage,
          additionalTargets: upgrades?.lightningAdditionalTargets
            ?? GAME.upgrade.lightningAdditionalTargets,
          range: GAME.upgrade.lightningRange,
          strikeChance: upgrades?.lightningStrikeChance ?? 0,
        },
      }],
    });
  }
  return { ...base, ...overrides };
}

function voidOrbitOverride(scene, payload, visual) {
  return {
    count: 2,
    orbitRadius: scene?.upgrades?.voidOrbitRadius ?? GAME.upgrade.voidOrbitRadius,
    radius: GAME.upgrade.voidOrbiterRadius,
    angularSpeed: scene?.upgrades?.voidOrbiterAngularSpeed
      ?? GAME.upgrade.voidOrbiterAngularSpeed,
    damage: GAME.upgrade.voidOrbiterDamage,
    baseDamageScale: GAME.upgrade.voidOrbiterDamage / GAME.combat.baseDamage,
    damageType: payload.type === 'lightning' ? 'electric' : payload.type,
    payload,
    visual,
  };
}

function mergeEffects(entries, periodic = false) {
  const merged = new Map();
  for (const entry of entries.flat()) {
    if (!entry?.id) continue;
    const previous = merged.get(entry.id) ?? {};
    merged.set(entry.id, {
      ...previous,
      ...entry,
      ...(periodic ? {
        interval: entry.interval ?? previous.interval,
        initialDelay: entry.initialDelay ?? previous.initialDelay,
      } : {}),
      config: { ...(previous.config ?? {}), ...(entry.config ?? {}) },
    });
  }
  return [...merged.values()];
}

function materializeComponent(component, context) {
  const definitions = context.scene?.ballDefinitions;
  if (!component.definitionId || !definitions?.has(component.definitionId)) return component;
  const definition = definitions.get(component.definitionId);
  const damageEffects = definition.damageEffects.map((effect) => ({
    id: effect.id,
    config: {
      ...effect.config,
      ...(component.damageEffectConfigOverrides?.[effect.id] ?? {}),
    },
  }));
  const orbitingDamage = definition.orbitingDamage ? {
    ...definition.orbitingDamage,
    ...component.orbitingDamageOverrides,
    visual: {
      ...definition.orbitingDamage.visual,
      ...(component.orbitingDamageOverrides?.visual ?? {}),
    },
  } : component.orbitingDamage;
  const guidance = definition.guidance ? {
    ...definition.guidance,
    ...component.guidanceOverrides,
  } : component.guidance;
  return {
    ...component,
    traits: normalizeTraits(definition.traits, component.traits),
    damageEffects: mergeEffects([damageEffects, component.damageEffects ?? []]),
    periodicEffects: mergeEffects([
      definition.periodicEffects,
      component.periodicEffects ?? [],
    ], true),
    guidance,
    orbitingDamage,
  };
}

export function composeShotDescriptors(parts, overrides = {}) {
  if (!Array.isArray(parts) || parts.length < 2) {
    throw new Error('A fusion requires at least two shot components');
  }
  const combined = {};
  let speedMultiplier = 1;
  let damageMultiplier = 1;
  const traits = [];
  const visualLayers = [];
  const damageEffects = [];
  const periodicEffects = [];
  const visualOverrides = {};
  const orbitingDamageOverrides = {};
  const guidanceOverrides = {};
  const damageEffectConfigOverrides = {};
  let guidance = null;
  let orbitingDamage = null;
  const overridesGuidance = Object.prototype.hasOwnProperty.call(overrides, 'guidance');
  const overridesOrbitingDamage = Object.prototype.hasOwnProperty.call(overrides, 'orbitingDamage');

  for (const part of parts) {
    Object.assign(combined, part);
    speedMultiplier *= part.speedMultiplier ?? 1;
    damageMultiplier *= part.damageMultiplier ?? 1;
    traits.push(part.traits ?? []);
    visualLayers.push(part.visualLayers ?? []);
    damageEffects.push(part.damageEffects ?? []);
    periodicEffects.push(part.periodicEffects ?? []);
    Object.assign(visualOverrides, part.visualOverrides ?? {});
    Object.assign(orbitingDamageOverrides, part.orbitingDamageOverrides ?? {});
    Object.assign(guidanceOverrides, part.guidanceOverrides ?? {});
    if (part.guidance) guidance = { ...(guidance ?? {}), ...part.guidance };
    if (part.orbitingDamage) {
      orbitingDamage = {
        ...(orbitingDamage ?? {}),
        ...part.orbitingDamage,
        visual: {
          ...(orbitingDamage?.visual ?? {}),
          ...(part.orbitingDamage.visual ?? {}),
        },
      };
    }
    for (const [effectId, config] of Object.entries(part.damageEffectConfigOverrides ?? {})) {
      damageEffectConfigOverrides[effectId] = {
        ...(damageEffectConfigOverrides[effectId] ?? {}),
        ...config,
      };
    }
  }

  for (const [effectId, config] of Object.entries(overrides.damageEffectConfigOverrides ?? {})) {
    damageEffectConfigOverrides[effectId] = {
      ...(damageEffectConfigOverrides[effectId] ?? {}),
      ...config,
    };
  }

  return {
    ...combined,
    ...overrides,
    speedMultiplier: speedMultiplier * (overrides.speedMultiplier ?? 1),
    damageMultiplier: damageMultiplier * (overrides.damageMultiplier ?? 1),
    traits: normalizeTraits(...traits, overrides.traits),
    visualLayers: [...new Set([...visualLayers.flat(), ...(overrides.visualLayers ?? [])])],
    visualOverrides: { ...visualOverrides, ...(overrides.visualOverrides ?? {}) },
    orbitingDamageOverrides: {
      ...orbitingDamageOverrides,
      ...(overrides.orbitingDamageOverrides ?? {}),
    },
    guidanceOverrides: { ...guidanceOverrides, ...(overrides.guidanceOverrides ?? {}) },
    guidance: overridesGuidance ? overrides.guidance : (guidance
      ? { ...guidance, ...guidanceOverrides, ...(overrides.guidanceOverrides ?? {}) }
      : null),
    orbitingDamage: overridesOrbitingDamage ? overrides.orbitingDamage : (orbitingDamage
      ? { ...orbitingDamage, ...orbitingDamageOverrides, ...(overrides.orbitingDamageOverrides ?? {}) }
      : null),
    damageEffectConfigOverrides: {
      ...damageEffectConfigOverrides,
    },
    damageEffects: overrides.replaceDamageEffects
      ? mergeEffects([overrides.damageEffects ?? []])
      : mergeEffects([...damageEffects, overrides.damageEffects ?? []]),
    periodicEffects: overrides.replacePeriodicEffects
      ? mergeEffects([overrides.periodicEffects ?? []], true)
      : mergeEffects([...periodicEffects, overrides.periodicEffects ?? []], true),
  };
}

export class BallFusionRegistry {
  constructor() { this.recipes = new Map(); }

  register(id, recipe) {
    if (!id || this.recipes.has(id)) throw new Error(`Ball fusion already exists: ${id}`);
    const componentIds = [...new Set(recipe.componentIds ?? [])];
    if (componentIds.length < 2) throw new Error('Ball fusion recipe requires at least two components');
    const requiredUpgrades = (recipe.requiredUpgrades ?? []).map((requirement) => (
      typeof requirement === 'string'
        ? { id: requirement, level: 1 }
        : { id: requirement.id, level: Math.max(1, requirement.level ?? 1) }
    ));
    this.recipes.set(id, {
      id,
      componentIds,
      requiredUpgrades,
      metadata: { ...(recipe.metadata ?? {}) },
      selectionWeight: Math.max(0, recipe.selectionWeight ?? 1),
      includeInAutomaticPool: recipe.includeInAutomaticPool ?? true,
      isAvailable: recipe.isAvailable ?? (() => true),
      overrides: { ...(recipe.overrides ?? {}) },
      createOverrides: recipe.createOverrides ?? (() => ({})),
      compose: recipe.compose ?? composeShotDescriptors,
    });
    return this;
  }

  has(id) { return this.recipes.has(id); }

  get(id) { return this.recipes.get(id) ?? null; }

  all() { return [...this.recipes.values()]; }

  unregister(id) { return this.recipes.delete(id); }

  createShot(id, components, context = {}) {
    const recipe = this.recipes.get(id);
    if (!recipe) throw new Error(`Unknown ball fusion: ${id}`);
    const componentMap = components instanceof Map
      ? components
      : new Map(components.map((component) => [component.componentId, component]));
    const parts = recipe.componentIds.map((componentId) => componentMap.get(componentId));
    const upgradeLevels = context.scene?.upgrades?.levels ?? {};
    const meetsUpgradeRequirements = recipe.requiredUpgrades.every(({ id: upgradeId, level }) => (
      (upgradeLevels[upgradeId] ?? 0) >= level
    ));
    if (parts.some((part) => !part)
      || !meetsUpgradeRequirements
      || !recipe.isAvailable(context)) return null;
    const dynamicOverrides = recipe.createOverrides(context) ?? {};
    return {
      ...recipe.compose(
        parts.map((part) => materializeComponent(part, context)),
        { replaceDefinitionAbilities: true, ...recipe.overrides, ...dynamicOverrides },
        context,
      ),
      shotType: id,
      componentId: id,
      source: `fusion:${id}`,
      fusionId: id,
      fusionComponents: [...recipe.componentIds],
      selectionWeight: recipe.selectionWeight,
    };
  }

  availableShots(components, context = {}) {
    const componentMap = new Map(components.map((component) => [component.componentId, component]));
    const shots = [];
    for (const id of this.recipes.keys()) {
      if (!this.recipes.get(id).includeInAutomaticPool) continue;
      const shot = this.createShot(id, componentMap, context);
      if (shot) shots.push(shot);
    }
    return shots;
  }
}

export function createDefaultBallFusions() {
  const registry = new BallFusionRegistry();
  const register = (catalogEntry, overrides) => registry.register(catalogEntry.id, {
    componentIds: catalogEntry.components,
    includeInAutomaticPool: false,
    metadata: {
      name: catalogEntry.name,
      description: catalogEntry.description,
      contentReady: true,
      acquisitionPending: true,
    },
    createOverrides: overrides.createOverrides,
    overrides: Object.fromEntries(
      Object.entries(overrides).filter(([key]) => key !== 'createOverrides'),
    ),
  });

  register(FUSION_BALL_CATALOG[0], {
    definitionId: BASIC_BALL_ID,
    emitterId: 'top',
    randomized: true,
    visualOverrides: {
      renderer: 'blast-core', color: '#ff704d', coreColor: '#fff4c7',
      innerColor: '#ffb347', trailColor: '#ff3d81', trailLength: 17,
    },
    visualLayers: [fusionLayer('#ffcf5c', '#ff3d81', 'comet')],
  });
  register(FUSION_BALL_CATALOG[1], {
    definitionId: VOID_ORBIT_BALL_ID,
    emitterId: 'top',
    randomized: true,
    orbitingDamage: null,
    replaceDamageEffects: true,
    replacePeriodicEffects: true,
    visualOverrides: { renderer: 'void-orbit', color: '#d26cff', trailColor: '#ff8b5c' },
    visualLayers: [fusionLayer('#ffcf5c', '#9b6cff', 'crown')],
    createOverrides: ({ scene }) => ({
      orbitingDamage: voidOrbitOverride(scene, voidPayload(scene, 'zenith'), {
        color: '#ff9f43', coreColor: '#fff6cf', trailColor: '#ff557f', payloadType: 'zenith',
      }),
    }),
  });
  register(FUSION_BALL_CATALOG[2], {
    definitionId: MICRO_NAVIGATION_BALL_ID,
    emitterId: 'top',
    randomized: true,
    visualOverrides: {
      renderer: 'micro-navigation', color: '#9cff85', coreColor: '#fff7c2',
      innerColor: '#7affe0', trailColor: '#ffb84d', trailLength: 16,
    },
    visualLayers: [fusionLayer('#ffd166', '#4fffc2', 'arrow')],
  });
  register(FUSION_BALL_CATALOG[3], {
    definitionId: LIGHTNING_BALL_ID,
    emitterId: 'top',
    randomized: true,
    visualOverrides: {
      renderer: 'lightning', color: '#8fe7ff', coreColor: '#fff9c9',
      innerColor: '#ffdd69', trailColor: '#6e7cff', trailLength: 17,
    },
    visualLayers: [fusionLayer('#ffe66d', '#57c7ff', 'bolt')],
    createOverrides: ({ scene }) => ({
      damageEffectConfigOverrides: {
        'chain-lightning': {
          damageMultiplier: scene?.upgrades?.topImpactDamageMultiplier ?? 1,
        },
      },
    }),
  });
  register(FUSION_BALL_CATALOG[4], {
    definitionId: VOID_ORBIT_BALL_ID,
    emitterId: 'paddle',
    randomized: false,
    orbitingDamage: null,
    replaceDamageEffects: true,
    replacePeriodicEffects: true,
    visualOverrides: { renderer: 'void-orbit', color: '#8f3bff', trailColor: '#ff3d9f' },
    visualLayers: [fusionLayer('#ff4fa3', '#8a4de0', 'pulse')],
    createOverrides: ({ scene }) => ({
      orbitingDamage: voidOrbitOverride(scene, voidPayload(scene, 'blast'), {
        color: '#ff4fa3', coreColor: '#fff5ff', trailColor: '#9b6cff', payloadType: 'blast',
      }),
    }),
  });
  register(FUSION_BALL_CATALOG[5], {
    definitionId: MICRO_NAVIGATION_BALL_ID,
    emitterId: 'paddle',
    randomized: false,
    visualOverrides: {
      renderer: 'blast-core', color: '#ff4fa3', coreColor: '#effff9',
      innerColor: '#58ffd0', trailColor: '#996cff', trailLength: 13,
    },
    visualLayers: [fusionLayer('#4fffc2', '#ff4fa3', 'arrow')],
  });
  register(FUSION_BALL_CATALOG[6], {
    definitionId: LIGHTNING_BALL_ID,
    emitterId: 'paddle',
    randomized: false,
    visualOverrides: {
      renderer: 'blast-core', color: '#8076ff', coreColor: '#ffffff',
      innerColor: '#5dc8ff', trailColor: '#ff4fa3', trailLength: 14,
    },
    visualLayers: [fusionLayer('#5dc8ff', '#ff4fa3', 'pulse')],
  });
  register(FUSION_BALL_CATALOG[7], {
    definitionId: VOID_ORBIT_BALL_ID,
    emitterId: 'paddle',
    randomized: false,
    orbitingDamage: null,
    guidance: null,
    replaceDamageEffects: true,
    replacePeriodicEffects: true,
    visualOverrides: { renderer: 'void-orbit', color: '#724be8', trailColor: '#38dca8' },
    visualLayers: [fusionLayer('#4fffc2', '#9b6cff', 'orbit')],
    createOverrides: ({ scene }) => ({
      orbitingDamage: voidOrbitOverride(scene, voidPayload(scene, 'navigation'), {
        color: '#4fffc2', coreColor: '#f3fffb', trailColor: '#20b98d', payloadType: 'navigation',
      }),
    }),
  });
  register(FUSION_BALL_CATALOG[8], {
    definitionId: VOID_ORBIT_BALL_ID,
    emitterId: 'paddle',
    randomized: false,
    orbitingDamage: null,
    replaceDamageEffects: true,
    replacePeriodicEffects: true,
    visualOverrides: { renderer: 'void-orbit', color: '#5146d8', trailColor: '#479eff' },
    visualLayers: [fusionLayer('#5dc8ff', '#9b6cff', 'bolt')],
    createOverrides: ({ scene }) => ({
      orbitingDamage: voidOrbitOverride(scene, voidPayload(scene, 'lightning'), {
        color: '#5dc8ff', coreColor: '#ffffff', trailColor: '#6e7cff', payloadType: 'lightning',
      }),
    }),
  });
  register(FUSION_BALL_CATALOG[9], {
    definitionId: LIGHTNING_BALL_ID,
    emitterId: 'paddle',
    randomized: false,
    visualOverrides: {
      renderer: 'micro-navigation', color: '#56e7ff', coreColor: '#ffffff',
      innerColor: '#75ffd8', trailColor: '#6677ff', trailLength: 14,
    },
    visualLayers: [fusionLayer('#4fffc2', '#5dc8ff', 'arrow')],
  });
  return registry;
}
