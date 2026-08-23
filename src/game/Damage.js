export function normalizeDamage(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.round(numeric));
}

export function normalizeDamageMultiplier(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 1;
  return Math.max(0, numeric);
}

export function scaleDamage(baseDamage, multiplier = 1) {
  return normalizeDamage(
    normalizeDamage(baseDamage) * normalizeDamageMultiplier(multiplier),
  );
}

export function resolveAbilityDamage(ball, config = {}, fallbackDamage = 0) {
  const hasBaseDamageScale = Number.isFinite(Number(config.baseDamageScale));
  const sourceDamage = hasBaseDamageScale
    ? scaleDamage(ball?.baseDamage ?? fallbackDamage, Number(config.baseDamageScale))
    : normalizeDamage(config.damage ?? fallbackDamage);
  const flatDamageBonus = normalizeDamage(config.flatDamageBonus ?? 0);
  return scaleDamage(
    sourceDamage + flatDamageBonus,
    config.damageMultiplier ?? 1,
  );
}

export function setBallBaseDamage(ball, baseDamage) {
  ball.baseDamage = normalizeDamage(baseDamage);
  ball.contactDamageMultiplier = normalizeDamageMultiplier(
    ball.contactDamageMultiplier,
  );
  ball.damage = ball.contactDamage === false
    ? 0
    : scaleDamage(ball.baseDamage, ball.contactDamageMultiplier);
  return ball.damage;
}

export function addBallBaseDamage(ball, bonus) {
  const current = ball.baseDamage ?? ball.damage ?? 0;
  return setBallBaseDamage(ball, current + normalizeDamage(bonus));
}
