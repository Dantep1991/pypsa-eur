import { atlasPresentationDocument, setAtlasFullscreen } from './atlasFullscreen';

function workspace() {
  const host = { documentElement: { requestFullscreen: jest.fn().mockResolvedValue() },
    exitFullscreen: jest.fn().mockResolvedValue(), fullscreenElement: null };
  const frame = { documentElement: { requestFullscreen: jest.fn() } };
  return { host, frame, scope: { document: frame, parent: { document: host } } };
}

test('embedded presentation includes the host Model portal, never just the map iframe', async () => {
  const { host, frame, scope } = workspace();
  expect(atlasPresentationDocument(scope)).toBe(host);
  await setAtlasFullscreen(true, scope);
  expect(host.documentElement.requestFullscreen).toHaveBeenCalledTimes(1);
  expect(frame.documentElement.requestFullscreen).not.toHaveBeenCalled();
});

test('standalone Atlas still owns its own fullscreen document', async () => {
  const { host } = workspace();
  const scope = { document: host }; scope.parent = scope;
  await setAtlasFullscreen(true, scope);
  expect(host.documentElement.requestFullscreen).toHaveBeenCalledTimes(1);
});

test('Exit presentation leaves host fullscreen and is safe when already exited', async () => {
  const { host, scope } = workspace();
  host.fullscreenElement = host.documentElement;
  await setAtlasFullscreen(false, scope);
  expect(host.exitFullscreen).toHaveBeenCalledTimes(1);
  host.fullscreenElement = null;
  await setAtlasFullscreen(false, scope);
  expect(host.exitFullscreen).toHaveBeenCalledTimes(1);
});

test('cross-origin and unsupported fullscreen retain layout without hiding the host portal', async () => {
  const { frame, scope } = workspace();
  Object.defineProperty(scope.parent, 'document', { get() { throw new Error('Cross origin'); } });
  expect(atlasPresentationDocument(scope)).toBeNull();
  await expect(setAtlasFullscreen(true, scope)).rejects.toThrow('host must own fullscreen');
  expect(frame.documentElement.requestFullscreen).not.toHaveBeenCalled();
  await expect(setAtlasFullscreen(false, scope)).resolves.toBeUndefined();
  await expect(setAtlasFullscreen(true, { parent: { document: {} } })).rejects.toThrow('unavailable');
});

test('a denied host request does not silently fall back to iframe fullscreen', async () => {
  const { host, frame, scope } = workspace();
  host.documentElement.requestFullscreen.mockRejectedValue(new Error('Denied'));
  await expect(setAtlasFullscreen(true, scope)).rejects.toThrow('Denied');
  expect(frame.documentElement.requestFullscreen).not.toHaveBeenCalled();
});
