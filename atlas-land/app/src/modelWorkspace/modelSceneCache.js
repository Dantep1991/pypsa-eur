// Fulfilled native display snapshots only: no shared in-flight abort signals.
// The service still validates schema/file changes on reads after this short TTL.
const scenes = new Map();
export const clearModelSceneCache = () => scenes.clear();
export const readModelSceneCache = key => {
  const entry = scenes.get(key);
  if (!entry || entry.expires <= Date.now()) { scenes.delete(key); return null; }
  return entry.scene;
};
export const saveModelSceneCache = (key, scene) => {
  scenes.set(key, { scene, expires: Date.now() + 30000 });
  while (scenes.size > 8) scenes.delete(scenes.keys().next().value);
};
