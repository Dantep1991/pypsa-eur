import React from 'react';
import { act, render } from '@testing-library/react';
import AudioLevelMeter from './AudioLevelMeter';
import { createAudioLevelStore } from '../voice/audioLevelStore';

test('microphone frames update only the meter, never its map-owning parent', () => {
  const store = createAudioLevelStore();
  const renderParent = jest.fn();
  function MapWorkspace() {
    renderParent();
    return <AudioLevelMeter store={store} active />;
  }
  const view = render(<MapWorkspace />);
  const initialRenders = renderParent.mock.calls.length;
  for (let i = 1; i <= 50; i += 1) act(() => store.publish(i));
  expect(renderParent).toHaveBeenCalledTimes(initialRenders);
  expect(view.container.querySelector('[style]').style.transform).toBe('scaleX(0.5)');
  view.unmount();
  expect(() => store.publish(0)).not.toThrow();
});
