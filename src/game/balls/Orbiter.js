export function getNaturalOrbiterPosition(ball, orbiter, sample = ball) {
  const angle = orbiter.phase + (sample.age ?? ball.age) * orbiter.angularSpeed;
  return {
    x: sample.x + Math.cos(angle) * orbiter.orbitRadius,
    y: sample.y + Math.sin(angle) * orbiter.orbitRadius,
    radius: orbiter.radius,
    angle,
  };
}

export function getOrbiterPosition(ball, orbiter, sample = ball) {
  if (sample === ball && orbiter.positionOverride) {
    return {
      ...orbiter.positionOverride,
      radius: orbiter.radius,
      angle: orbiter.positionOverride.angle
        ?? orbiter.phase + (ball.age ?? 0) * orbiter.angularSpeed,
    };
  }
  return getNaturalOrbiterPosition(ball, orbiter, sample);
}

export function getOrbiterTrail(ball, orbiter) {
  return ball.trail.map((sample) => getOrbiterPosition(ball, orbiter, sample));
}
