let nextEntityId = 1;

export class Entity {
  constructor(type, props = {}) {
    this.id = `${type}-${nextEntityId++}`;
    this.type = type;
    this.tags = new Set(props.tags ?? []);
    this.active = true;
    this.visible = true;
    Object.assign(this, props);
  }

  hasTag(tag) { return this.tags.has(tag); }
  addTag(tag) { this.tags.add(tag); return this; }
  destroy() { this.active = false; this.visible = false; }
}

export class World {
  #entities = new Map();
  #pendingAdd = [];
  #pendingRemove = new Set();

  add(entity) {
    this.#pendingAdd.push(entity);
    return entity;
  }

  remove(entityOrId) {
    this.#pendingRemove.add(typeof entityOrId === 'string' ? entityOrId : entityOrId.id);
  }

  flush() {
    for (const entity of this.#pendingAdd) this.#entities.set(entity.id, entity);
    this.#pendingAdd.length = 0;
    for (const id of this.#pendingRemove) this.#entities.delete(id);
    this.#pendingRemove.clear();
    for (const [id, entity] of this.#entities) if (!entity.active) this.#entities.delete(id);
  }

  all(type) {
    return [...this.#entities.values()].filter((entity) => entity.active && (!type || entity.type === type));
  }

  count(type, { includePending = false } = {}) {
    const activeIds = new Set(this.all(type).map(({ id }) => id));
    if (includePending) {
      for (const entity of this.#pendingAdd) {
        if (entity.active && (!type || entity.type === type)) activeIds.add(entity.id);
      }
    }
    return activeIds.size;
  }

  tagged(tag) { return [...this.#entities.values()].filter((entity) => entity.active && entity.hasTag(tag)); }
  first(type) { return this.all(type)[0]; }
  clear() { this.#entities.clear(); this.#pendingAdd.length = 0; this.#pendingRemove.clear(); }
}
