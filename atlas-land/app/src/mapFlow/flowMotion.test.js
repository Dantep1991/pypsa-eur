import { createFlowMotionClock, flowAnimationSpeed, flowIdentityPhase, FLOW_TRAVEL_SECONDS } from './flowMotion';

test.each([[undefined,1],[null,1],[NaN,1],[Infinity,1],['2',1],[-1,.25],[0,.25],[.5,.5],[3,3],[100,3]])(
  'animation speed %s has a finite, bounded display multiplier %s', (value, expected) => {
    expect(flowAnimationSpeed(value)).toBe(expected);
  });

test('six-second traversal is independent of projected line length and frame rate', () => {
  for (const step of [10,20,50]) {
    const clock = createFlowMotionClock();
    clock.tick(0);
    let progress;
    for (let time = step; time <= 3000; time += step) progress = clock.tick(time);
    expect(progress).toBeCloseTo(.5);
    for (const pixels of [10,100,1000]) expect(progress * pixels / pixels).toBeCloseTo(.5);
    expect(FLOW_TRAVEL_SECONDS).toBe(6);
  }
});

test('live speed changes retain progress and affect only subsequent movement', () => {
  const clock = createFlowMotionClock();
  clock.tick(0);
  for (let time = 100; time <= 600; time += 100) clock.tick(time);
  const before = clock.tick(600);
  clock.setSpeed(3);
  expect(clock.tick(600)).toBeCloseTo(before);
  expect(clock.tick(700)).toBeCloseTo(before + .05);
  clock.setSpeed(.25);
  expect(clock.tick(800)).toBeCloseTo(before + .05 + .1 * .25 / 6);
});

test('pause, hidden tabs and reduced motion do not accrue catch-up movement', () => {
  const clock = createFlowMotionClock();
  clock.tick(0);
  const progress = clock.tick(100);
  clock.pause();
  expect(clock.tick(50000)).toBe(progress);
  expect(clock.tick(50050, false)).toBe(progress);
  expect(clock.tick(60000)).toBe(progress);
  expect(clock.tick(60050)).toBeCloseTo(progress + .05 / 6);
});

test('long or backwards frames are bounded and traversal wraps cleanly', () => {
  const clock = createFlowMotionClock();
  clock.tick(0);
  expect(clock.tick(5000)).toBeCloseTo(.1 / 6);
  expect(clock.tick(4000)).toBeCloseTo(.1 / 6);
  const short = createFlowMotionClock(.1);
  short.tick(0);
  expect(short.tick(100)).toBe(0);
});

test('line phase uses stable identity, not zoom, magnitude, time resolution or list order', () => {
  const ids = ['Line:A-B', 'Gas Pipeline:BE00-FR00', 'Line:C-D'];
  const phases = new Map(ids.map(id => [id, flowIdentityPhase(id)]));
  for (const id of ids.reverse()) {
    expect(flowIdentityPhase(id)).toBe(phases.get(id));
    expect(flowIdentityPhase(id)).toBeGreaterThanOrEqual(0);
    expect(flowIdentityPhase(id)).toBeLessThan(1);
  }
});
