import { normalizeTraits } from './BallTraits.js';

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
    guidance: overrides.guidance ?? (guidance
      ? { ...guidance, ...guidanceOverrides, ...(overrides.guidanceOverrides ?? {}) }
      : null),
    orbitingDamage: overrides.orbitingDamage ?? (orbitingDamage
      ? { ...orbitingDamage, ...orbitingDamageOverrides, ...(overrides.orbitingDamageOverrides ?? {}) }
      : null),
    damageEffectConfigOverrides: {
      ...damageEffectConfigOverrides,
    },
    damageEffects: mergeEffects([...damageEffects, overrides.damageEffects ?? []]),
    periodicEffects: mergeEffects(
      [...periodicEffects, overrides.periodicEffects ?? []],
      true,
    ),
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
      isAvailable: recipe.isAvailable ?? (() => true),
      overrides: { ...(recipe.overrides ?? {}) },
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
    return {
      ...recipe.compose(
        parts.map((part) => materializeComponent(part, context)),
        { replaceDefinitionAbilities: true, ...recipe.overrides },
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
      const shot = this.createShot(id, componentMap, context);
      if (shot) shots.push(shot);
    }
    return shots;
  }
}

export function createDefaultBallFusions() {
  return new BallFusionRegistry();
}
