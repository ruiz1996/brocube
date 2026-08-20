export class PluginManager {
  constructor(context) {
    this.context = context;
    this.plugins = new Map();
  }

  use(plugin) {
    if (!plugin?.id || this.plugins.has(plugin.id)) return this;
    this.plugins.set(plugin.id, plugin);
    plugin.install?.(this.context);
    return this;
  }

  call(hook, payload) {
    for (const plugin of this.plugins.values()) plugin[hook]?.(payload, this.context);
  }

  dispose() {
    for (const plugin of this.plugins.values()) plugin.dispose?.(this.context);
    this.plugins.clear();
  }
}
