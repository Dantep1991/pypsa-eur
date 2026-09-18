import { act, renderHook } from '@testing-library/react';
import { useConversationScroll } from './useConversationScroll';

function setup() {
  let props = { messages: ['hello'], active: false, busy: false, partial: '' };
  const hook = renderHook((value) => useConversationScroll(value), { initialProps: props });
  const element = { scrollTop: 0, scrollHeight: 1000, clientHeight: 200, focus: jest.fn() };
  hook.result.current.containerRef.current = element;
  const update = (patch) => { props = { ...props, ...patch }; hook.rerender(props); };
  update({ active: true });
  const scroll = (top) => act(() => { element.scrollTop = top; hook.result.current.onScroll(); });
  return { ...hook, element, update, scroll };
}

test('follows messages and partial output at the end without animated page scrolling', () => {
  const { result, element, update } = setup();
  expect(element.scrollTop).toBe(1000);
  element.scrollHeight = 1200;
  update({ messages: ['hello', 'reply'] });
  expect(element.scrollTop).toBe(1200);
  element.scrollHeight = 1300;
  update({ partial: 'show France', busy: true });
  expect(element.scrollTop).toBe(1300);
  expect(result.current.following).toBe(true);
  expect(element.focus).not.toHaveBeenCalled();
});

test('reading older output is not interrupted by messages, partials or busy updates', () => {
  const { result, element, update, scroll } = setup();
  scroll(100);
  update({ partial: 'show', busy: true });
  expect(element.scrollTop).toBe(100);
  expect(result.current.unread).toBe(false);
  update({ messages: ['hello', 'reply'] });
  expect(element.scrollTop).toBe(100);
  expect(result.current.unread).toBe(true);
  expect(result.current.following).toBe(false);
  act(() => result.current.jumpToLatest());
  expect(element.scrollTop).toBe(1000);
  expect(result.current.unread).toBe(false);
  expect(result.current.following).toBe(true);
  expect(element.focus).toHaveBeenCalledWith({ preventScroll: true });
});

test('returning to the end manually resumes following within a small tolerance', () => {
  const { result, update, scroll } = setup();
  scroll(700);
  update({ messages: ['reply'] });
  expect(result.current.unread).toBe(true);
  scroll(775);
  expect(result.current.following).toBe(true);
  expect(result.current.unread).toBe(false);
});

test('hidden output does not scroll and the reading position survives a remounted log', () => {
  const { result, element, update, scroll } = setup();
  scroll(180);
  update({ active: false });
  element.scrollTop = 0;
  act(() => result.current.onScroll()); // Layout while hidden must not reset the reader.
  update({ messages: ['hello', 'hidden reply'], partial: 'partial' });
  expect(element.scrollTop).toBe(0);
  const replacement = { ...element };
  result.current.containerRef.current = replacement;
  update({ active: true });
  expect(replacement.scrollTop).toBe(180);
  expect(result.current.unread).toBe(true);
});
