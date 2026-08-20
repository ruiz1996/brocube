export function getOrbiterPosition(ball, orbiter) {
  const angle = orbiter.phase + ball.age * orbiter.angularSpeed;
  return {
    x: ball.x + Math.cos(angle) * orbiter.orbitRadius,
    y: ball.y + Math.sin(angle) * orbiter.orbitRadius,
    radius: orbiter.radius,
    angle,
  };
}
