import { GAME } from './config.js';

export function normalizeWorldLevel(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return GAME.worldLevel.defaultLevel;
  return Math.min(Number.MAX_SAFE_INTEGER, Math.max(1, Math.floor(numeric)));
}

function calculatePowerGrowth(levelOffset, coefficient, exponent, maximum) {
  if (levelOffset <= 0 || coefficient <= 0) return 1;
  const logarithm = Math.max(0, exponent) * Math.log1p(coefficient * levelOffset);
  if (!Number.isFinite(logarithm) || logarithm >= Math.log(maximum)) return maximum;
  return Math.min(maximum, Math.exp(logarithm));
}

export function clampWorldValue(value, minimum = 0, config = GAME.worldLevel) {
  const maximum = config.maximumNumericValue ?? Number.MAX_SAFE_INTEGER;
  if (!Number.isFinite(value)) return value > 0 ? maximum : minimum;
  return Math.min(maximum, Math.max(minimum, value));
}

export function calculateWorldLevelModifiers(level, config = GAME.worldLevel) {
  const normalizedLevel = normalizeWorldLevel(level);
  const levelOffset = normalizedLevel - 1;
  const maximum = config.maximumNumericValue ?? Number.MAX_SAFE_INTEGER;
  const bonusChestGrowth = calculatePowerGrowth(
    levelOffset,
    config.bonusChestCoefficient ?? 0,
    config.bonusChestExponent ?? 1,
    maximum,
  );
  return Object.freeze({
    level: normalizedLevel,
    levelOffset,
    enemyHealthMultiplier: calculatePowerGrowth(
      levelOffset,
      config.enemyHealthCoefficient,
      config.enemyHealthExponent,
      maximum,
    ),
    bossHealthMultiplier: calculatePowerGrowth(
      levelOffset,
      config.bossHealthCoefficient,
      config.bossHealthExponent,
      maximum,
    ),
    scoreMultiplier: calculatePowerGrowth(
      levelOffset,
      config.scoreCoefficient,
      config.scoreExponent,
      maximum,
    ),
    bonusChestExpectation: Math.max(0, bonusChestGrowth - 1),
  });
}
