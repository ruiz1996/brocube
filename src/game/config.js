export const GAME = Object.freeze({
  width: 960,
  height: 600,
  playTop: 62,
  playBottom: 590,
  paddle: { width: 124, height: 15, y: 552, speed: 650 },
  ball: { radius: 7, speed: 370, maxSpeed: 620 },
  autoFireInterval: 5,
  upgrade: {
    scoreInterval: 2000,
    rapidFireMultiplier: 0.86,
    minimumFireInterval: 0.75,
    extraBallChancePerLevel: 0.2,
    ballSpeedMultiplierPerLevel: 1.12,
    paddleLengthMultiplierPerLevel: 1.2,
    paddleLengthMaxLevel: 3,
    bottomBounceChancePerLevel: 0.2,
    bottomBounceMaxLevel: 3,
    randomLaunchMinAngle: 0.35,
  },
  brick: {
    minWidth: 48,
    maxWidth: 86,
    minHeight: 30,
    maxHeight: 58,
    initialSpeed: 9,
    maxSpeed: 34,
    initialSpawnInterval: 2.7,
    minSpawnInterval: 1.15,
    healthFormula: {
      // 期望血量 = baseHp
      //   + timeCoefficient * (存活分钟数 ^ timeExponent)
      //   + scoreCoefficient * ((分数 / scoreScale) ^ scoreExponent)
      baseHp: 1.4,
      timeCoefficient: 0.75,
      timeExponent: 1.1,
      scoreCoefficient: 1.1,
      scoreScale: 5000,
      scoreExponent: 0.55,
      randomSpread: 1.25,
      minHp: 1,
    },
  },
});

export const COLORS = Object.freeze({
  background: '#070b18',
  grid: 'rgba(104, 131, 189, 0.065)',
  cyan: '#55e8ff',
  violet: '#8b7cff',
  pink: '#ff5cab',
  orange: '#ff9b54',
  text: '#dceaff',
});
