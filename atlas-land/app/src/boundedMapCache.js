// Session-long maps must not retain every icon produced by every zoom,
// country and scenario. A small LRU reuses common styles with bounded memory.
export class BoundedMapCache extends Map {
  constructor(limit = 512) { super(); this.limit = Math.max(1, Math.floor(limit)); }
  get(key) {
    if (!super.has(key)) return undefined;
    const value = super.get(key);
    super.delete(key);
    super.set(key, value);
    return value;
  }
  set(key, value) {
    super.delete(key);
    super.set(key, value);
    if (this.size > this.limit) super.delete(this.keys().next().value);
    return this;
  }
}
