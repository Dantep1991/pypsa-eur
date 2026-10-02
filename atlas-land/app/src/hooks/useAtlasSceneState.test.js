import React, { useState } from 'react';
import { fireEvent, render } from '@testing-library/react';
import useAtlasSceneState from './useAtlasSceneState';

test('scene restore returns immutable data and does not restore while busy', () => {
  const original = [{ id: 'FR' }]; let scene; let api;
  function Harness({ busy = false }) {
    const [data, setData] = useState(original);
    api = useAtlasSceneState({ data: [data, setData] }, busy);
    return <><span>{data[0].id}</span><button onClick={() => { scene = api.capture(); }}>Save</button><button onClick={() => setData([{ id: 'BE' }])}>Change</button><button onClick={() => api.restore(scene)}>Restore</button></>;
  }
  const view = render(<Harness />);
  fireEvent.click(view.getByText('Save')); expect(scene.data).toBe(original);
  fireEvent.click(view.getByText('Change')); expect(view.getByText('BE')).toBeTruthy();
  fireEvent.click(view.getByText('Restore')); expect(view.getByText('FR')).toBeTruthy();
  view.rerender(<Harness busy />); expect(() => api.restore(scene)).toThrow('Wait');
});
