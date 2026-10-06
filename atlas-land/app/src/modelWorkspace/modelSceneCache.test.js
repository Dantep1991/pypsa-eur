import { clearModelSceneCache, readModelSceneCache, saveModelSceneCache } from './modelSceneCache';
beforeEach(clearModelSceneCache);
test('fulfilled display views are separate for each exact binding/layer key', () => {
  const scene = { facilities: [{ id: 'A' }] };
  saveModelSceneCache('P:v1:2050:Supply', scene);
  expect(readModelSceneCache('P:v1:2050:Supply')).toBe(scene);
  expect(readModelSceneCache('P:v2:2050:Supply')).toBeNull();
  expect(readModelSceneCache('P:v1:2030:Supply')).toBeNull();
  expect(readModelSceneCache('P:v1:2050:Storage')).toBeNull();
});
test('TTL does not slide and an explicit refresh clears views', () => {
  const clock = jest.spyOn(Date, 'now').mockReturnValue(1);
  try {
    saveModelSceneCache('view', {});
    clock.mockReturnValue(20000);
    expect(readModelSceneCache('view')).not.toBeNull();
    clock.mockReturnValue(31000);
    expect(readModelSceneCache('view')).toBeNull();
    saveModelSceneCache('view', {});
    clearModelSceneCache();
    expect(readModelSceneCache('view')).toBeNull();
  } finally { clock.mockRestore(); }
});
