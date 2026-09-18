import { waitForVoiceStep } from './waitForVoiceStep';

test.each(['resolve', 'reject'])('voice wait removes its abort listener after %s', async outcome => {
  const controller = new AbortController();
  const remove = jest.spyOn(controller.signal, 'removeEventListener');
  const work = waitForVoiceStep(() => outcome === 'resolve' ? 'ready' : Promise.reject(new Error('failed')), controller.signal);
  if (outcome === 'resolve') await expect(work).resolves.toBe('ready');
  else await expect(work).rejects.toThrow('failed');
  expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
});

test('voice cancellation settles without its transport and consumes late rejection', async () => {
  const controller = new AbortController();
  const remove = jest.spyOn(controller.signal, 'removeEventListener');
  let reject;
  const transport = new Promise((_, no) => { reject = no; });
  const result = waitForVoiceStep(transport, controller.signal);
  controller.abort();
  await expect(result).rejects.toMatchObject({ name: 'AbortError' });
  expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
  reject(new Error('late network error'));
  await Promise.resolve();
});

test('already cancelled voice work never starts a factory', async () => {
  const controller = new AbortController();
  controller.abort();
  const factory = jest.fn();
  await expect(waitForVoiceStep(factory, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
  expect(factory).not.toHaveBeenCalled();
  await expect(waitForVoiceStep(Promise.reject(new Error('already failed')), controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
});
