import {
  BlastWave,
  BrickShard,
  ImpactWave,
  Particle,
} from '../entities/entities.js';

const EFFECT_LIMITS = {
  particle: 120,
  'impact-wave': 24,
  'brick-shard': 36,
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export class EffectsSystem {
  constructor(scene) {
    this.scene = scene;
    this.shake = 0;
    this.flash = 0;
    this.flashColor = '#ffffff';
    this.pending = new Map();
    this.activeCounts = new Map();
    this.unsubscribers = [
      scene.events.on('brick:damaged', (payload) => this.#brickHit(payload)),
      scene.events.on('brick:destroyed', (payload) => this.#brickDestroyed(payload)),
      scene.events.on('ball:bounce', ({ ball, surface }) => {
        if (surface === 'paddle') this.burst(ball.x, ball.y + ball.radius, '#55e8ff', 4);
      }),
      scene.events.on('ball:launched', ({ ball, source }) => {
        if (source !== 'top-launch') return;
        this.burst(ball.x, ball.y, '#ffad5a', 9);
        this.burst(ball.x, ball.y, '#ff5c7d', 5);
      }),
      scene.events.on('ball:exploded', ({ x, y, radius, color, secondaryColor }) => {
        this.scene.world.add(new BlastWave({ x, y, radius, color, secondaryColor }));
        this.burst(x, y, color, 12);
        this.burst(x, y, secondaryColor, 5);
        this.shake = Math.max(this.shake, 2.5);
        this.flash = Math.max(this.flash, .06);
        this.flashColor = color;
      }),
    ];
  }

  burst(x, y, color, count, options = {}) {
    for (let i = 0; i < count; i += 1) {
      const angle = options.angle === undefined
        ? Math.random() * Math.PI * 2
        : options.angle + (Math.random() - .5) * (options.spread ?? 1.4);
      const speed = (options.minimumSpeed ?? 45) + Math.random() * (options.speedRange ?? 150);
      this.#add(new Particle({
        x, y, color,
        velocityX: Math.cos(angle) * speed,
        velocityY: Math.sin(angle) * speed,
        life: (options.minimumLife ?? .25) + Math.random() * (options.lifeRange ?? .35),
        size: (options.minimumSize ?? 1.5) + Math.random() * (options.sizeRange ?? 3),
        style: options.style ?? 'square',
        length: (options.minimumLength ?? 6) + Math.random() * (options.lengthRange ?? 10),
        gravity: options.gravity ?? 90,
        drag: options.drag ?? .985,
      }));
    }
  }

  #brickHit({ brick, ball, contact }) {
    const point = this.#impactPoint(brick, ball, contact);
    const normal = contact?.normal;
    const angle = normal ? Math.atan2(normal.ny, normal.nx) : undefined;
    this.#add(new ImpactWave({
      x: point.x,
      y: point.y,
      radius: Math.max(20, Math.min(34, Math.min(brick.width, brick.height) * .85)),
      color: brick.color,
      life: .24,
      variant: 'hit',
    }));
    this.burst(point.x, point.y, brick.color, 5, {
      angle,
      spread: normal ? 1.15 : Math.PI * 2,
      minimumSpeed: 90,
      speedRange: 190,
      minimumLife: .12,
      lifeRange: .18,
      minimumSize: 1,
      sizeRange: 1.5,
      style: 'streak',
      minimumLength: 7,
      lengthRange: 12,
      gravity: 25,
      drag: .96,
    });
    this.shake = Math.max(this.shake, .5);
  }

  #brickDestroyed({ brick, ball, contact }) {
    const centerX = brick.x + brick.width / 2;
    const centerY = brick.y + brick.height / 2;
    const radius = Math.max(42, Math.hypot(brick.width, brick.height) * .9);
    const impact = this.#impactPoint(brick, ball, contact);
    this.#add(new ImpactWave({
      x: centerX, y: centerY, radius,
      color: brick.color, secondaryColor: '#ffffff',
      life: .4, variant: 'kill',
    }));
    if (brick.variant === 'boss') {
      this.#add(new ImpactWave({
        x: centerX, y: centerY, radius: radius * 1.35, startRadius: radius * .2,
        color: '#ffffff', secondaryColor: brick.color,
        life: .5, variant: 'kill',
      }));
    }
    this.burst(centerX, centerY, brick.color, brick.variant === 'boss' ? 16 : 8, {
      minimumSpeed: 75,
      speedRange: 230,
      minimumLife: .28,
      lifeRange: .42,
      minimumSize: 1.8,
      sizeRange: 3.8,
    });
    this.burst(impact.x, impact.y, '#ffffff', brick.variant === 'boss' ? 10 : 6, {
      angle: contact?.normal ? Math.atan2(contact.normal.ny, contact.normal.nx) : undefined,
      spread: contact?.normal ? 1.5 : Math.PI * 2,
      minimumSpeed: 130,
      speedRange: 260,
      minimumLife: .16,
      lifeRange: .28,
      minimumSize: 1,
      sizeRange: 2,
      style: 'streak',
      minimumLength: 10,
      lengthRange: 18,
      gravity: 40,
      drag: .965,
    });
    this.#shatter(brick, centerX, centerY);
    this.shake = Math.max(this.shake, brick.variant === 'boss' ? 6 : 3);
    this.flash = Math.max(this.flash, brick.variant === 'boss' ? .18 : .08);
    this.flashColor = brick.color;
  }

  #impactPoint(brick, ball, contact) {
    const centerX = brick.x + brick.width / 2;
    const centerY = brick.y + brick.height / 2;
    if (contact?.normal) {
      return {
        x: centerX + contact.normal.nx * brick.width * .48,
        y: centerY + contact.normal.ny * brick.height * .48,
      };
    }
    if (ball) {
      return {
        x: clamp(ball.x, brick.x, brick.x + brick.width),
        y: clamp(ball.y, brick.y, brick.y + brick.height),
      };
    }
    return { x: centerX, y: centerY };
  }

  #shatter(brick, centerX, centerY) {
    const points = brick.worldPoints();
    const shardCount = Math.min(points.length, brick.variant === 'boss' ? 8 : 5);
    for (let shardIndex = 0; shardIndex < shardCount; shardIndex += 1) {
      const index = Math.floor(shardIndex * points.length / shardCount);
      const first = points[index];
      const second = points[(index + 1) % points.length];
      const shardCenterX = (centerX + first.x + second.x) / 3;
      const shardCenterY = (centerY + first.y + second.y) / 3;
      const directionX = shardCenterX - centerX;
      const directionY = shardCenterY - centerY;
      const length = Math.hypot(directionX, directionY) || 1;
      const speed = 80 + Math.random() * 150;
      this.#add(new BrickShard({
        x: shardCenterX,
        y: shardCenterY,
        points: [
          { x: centerX - shardCenterX, y: centerY - shardCenterY },
          { x: first.x - shardCenterX, y: first.y - shardCenterY },
          { x: second.x - shardCenterX, y: second.y - shardCenterY },
        ],
        velocityX: directionX / length * speed,
        velocityY: directionY / length * speed - 35,
        color: brick.color,
        life: .48 + Math.random() * .3,
        angularVelocity: (Math.random() - .5) * 12,
      }));
    }
  }

  #add(entity) {
    const limit = EFFECT_LIMITS[entity.type];
    if (limit !== undefined) {
      const pending = this.pending.get(entity.type) ?? 0;
      let active = this.activeCounts.get(entity.type);
      if (active === undefined) {
        active = this.scene.world.all(entity.type).length;
        this.activeCounts.set(entity.type, active);
      }
      if (active + pending >= limit) return null;
      this.pending.set(entity.type, pending + 1);
    }
    return this.scene.world.add(entity);
  }

  update(dt) {
    for (const particle of this.scene.world.all('particle')) {
      particle.x += particle.velocityX * dt;
      particle.y += particle.velocityY * dt;
      particle.velocityX *= particle.drag;
      particle.velocityY = particle.velocityY * particle.drag + particle.gravity * dt;
      particle.life -= dt;
      if (particle.life <= 0) particle.destroy();
    }
    for (const shard of this.scene.world.all('brick-shard')) {
      shard.x += shard.velocityX * dt;
      shard.y += shard.velocityY * dt;
      shard.velocityX *= .99;
      shard.velocityY = shard.velocityY * .99 + 150 * dt;
      shard.rotation += shard.angularVelocity * dt;
      shard.life -= dt;
      if (shard.life <= 0) shard.destroy();
    }
    for (const wave of this.scene.world.all('impact-wave')) {
      wave.life -= dt;
      if (wave.life <= 0) wave.destroy();
    }
    for (const wave of this.scene.world.all('blast-wave')) {
      wave.life -= dt;
      if (wave.life <= 0) wave.destroy();
    }
    this.shake = Math.max(0, this.shake - dt * 24);
    this.flash = Math.max(0, this.flash - dt * 1.7);
    this.pending.clear();
    this.activeCounts.clear();
  }

  dispose() { this.unsubscribers.forEach((unsubscribe) => unsubscribe()); }
}
