import { useState } from 'react';
import { act, renderHook } from '@testing-library/react';
import { useContextMessages } from './useContextMessages';

test('batched and late callbacks preserve intervening messages and stay in their original context', () => {
  const view = renderHook(({ context }) => {
    const [store, setStore] = useState({ results: ['initial'], copilot: ['other'] });
    const [messages, setMessages] = useContextMessages(store, setStore, context);
    return { store, messages, setMessages };
  }, { initialProps: { context: 'results' } });
  const originalSetter = view.result.current.setMessages;
  act(() => { originalSetter(prev => [...prev, 'question']); originalSetter(prev => [...prev, 'progress']); });
  expect(view.result.current.messages).toEqual(['initial', 'question', 'progress']);
  view.rerender({ context: 'copilot' });
  act(() => originalSetter(prev => [...prev, 'answer']));
  expect(view.result.current.messages).toEqual(['other']);
  expect(view.result.current.store.results).toEqual(['initial', 'question', 'progress', 'answer']);
});
