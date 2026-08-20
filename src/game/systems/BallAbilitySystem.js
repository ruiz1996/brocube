export class BallAbilitySystem {
  constructor(scene) { this.scene = scene; }

  update(dt) {
    for (const ball of this.scene.world.all('ball')) {
      for (const effect of ball.periodicEffects) {
        effect.timeRemaining -= dt;
        let activations = 0;
        while (effect.timeRemaining <= 0 && activations < 4 && ball.active) {
          this.scene.ballBehaviors.runPeriodicEffect(effect.id, {
            scene: this.scene,
            world: this.scene.world,
            events: this.scene.events,
            combat: this.scene.ballCombat,
            ball,
            effectConfig: effect.config,
          });
          effect.timeRemaining += effect.interval;
          activations += 1;
        }
      }
    }
  }
}
