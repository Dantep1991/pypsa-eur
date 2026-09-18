import { useCallback, useLayoutEffect, useRef, useState } from 'react';

// Follow new output only while the reader is already at the end. Keep the
// reading position across map inspection and panel close/reopen, without
// scrolling the page or starting smooth animations for partial transcripts.
export function useConversationScroll({ messages, active, busy, partial }) {
  const containerRef = useRef(null);
  const followingRef = useRef(true);
  const positionRef = useRef(0);
  const wasActiveRef = useRef(false);
  const previousMessagesRef = useRef(messages);
  const [following, setFollowing] = useState(true);
  const [unread, setUnread] = useState(false);

  const onScroll = useCallback(() => {
    const element = containerRef.current;
    if (!active || !element) return;
    positionRef.current = element.scrollTop;
    const atEnd = element.scrollHeight - element.clientHeight - element.scrollTop <= 32;
    if (atEnd !== followingRef.current) {
      followingRef.current = atEnd;
      setFollowing(atEnd);
    }
    if (atEnd) setUnread(false);
  }, [active]);

  const jumpToLatest = useCallback(() => {
    followingRef.current = true;
    setFollowing(true);
    setUnread(false);
    const element = containerRef.current;
    if (element) {
      element.scrollTop = element.scrollHeight;
      positionRef.current = element.scrollTop;
      // The button disappears; retain keyboard focus in the conversation.
      element.focus({ preventScroll: true });
    }
  }, []);

  useLayoutEffect(() => {
    const changed = previousMessagesRef.current !== messages;
    previousMessagesRef.current = messages;
    if (changed && !followingRef.current) setUnread(true);
    const element = containerRef.current;
    if (active && element) {
      if (followingRef.current) {
        element.scrollTop = element.scrollHeight;
        positionRef.current = element.scrollTop;
      } else if (!wasActiveRef.current) {
        element.scrollTop = positionRef.current;
      }
    }
    wasActiveRef.current = active;
  }, [messages, active, busy, partial]);

  return { containerRef, onScroll, jumpToLatest, following, unread };
}
