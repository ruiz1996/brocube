export const BALL_TRAITS = Object.freeze({
  TOP_LAUNCH: 'top-launch',
  BLAST_CORE: 'blast-core',
  VOID_ORBIT: 'void-orbit',
  MICRO_NAVIGATION: 'micro-navigation',
  CHAIN_LIGHTNING: 'chain-lightning',
  DERIVED: 'derived-ball',
});

export function normalizeTraits(...traitGroups) {
  const traits = new Set();
  for (const group of traitGroups) {
    if (!group) continue;
    const values = typeof group === 'string' ? [group] : group;
    for (const trait of values) {
      if (typeof trait === 'string' && trait.length > 0) traits.add(trait);
    }
  }
  return [...traits];
}
