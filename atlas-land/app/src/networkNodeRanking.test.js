import { networkNodeDegrees, rankNetworkNodes, takeRankedVisibleNodes } from './networkNodeRanking';

test('normalized endpoints count once and alternative spelling resolves the same degree', () => {
  const degree = networkNodeDegrees([{ from: 'A-B', to: 'C' }, { from: 'A-B', to: 'D' }]);
  expect(degree.get('A-B')).toBe(2);
  expect(degree.get('AB')).toBe(2);
  expect(degree.get('C')).toBe(1);
  expect(degree.get('D')).toBe(1);
});

test('ranks graph hubs, preserves stable ties and never changes source order', () => {
  const nodes = Object.freeze([{ id: 'C' }, { id: 'D' }, { id: 'a_b' }, { id: 'isolated' }]);
  const links = Object.freeze([{ from: 'A-B', to: 'C' }, { from: 'A-B', to: 'D' }]);
  const ranked = rankNetworkNodes(nodes, links);
  expect(ranked.map(node => node.id)).toEqual(['a_b', 'C', 'D', 'isolated']);
  expect(nodes.map(node => node.id)).toEqual(['C', 'D', 'a_b', 'isolated']);
  expect(rankNetworkNodes([{ id: 'asset', cluster_id: 'A-B' }, nodes[0]], links).map(n => n.id)).toEqual(['asset', 'C']);
});

test('viewport clipping selects the same top nodes as re-sorting each viewport', () => {
  const nodes = Array.from({ length: 2000 }, (_, index) => ({ id: `node_${index}`, sameLocationCount: index % 9 }));
  const links = Array.from({ length: 5000 }, (_, index) => ({ from: `node_${index % 300}`, to: `node_${index % 2000}` }));
  const ranked = rankNetworkNodes(nodes, links);
  for (let view = 0; view < 20; view += 1) {
    const visible = nodes.filter((_, index) => index % (view + 2) === 0);
    expect(takeRankedVisibleNodes(ranked, visible, 180)).toEqual(rankNetworkNodes(visible, links).slice(0, 180));
  }
  expect(takeRankedVisibleNodes(ranked, [], 180)).toEqual([]);
  expect(takeRankedVisibleNodes(ranked, nodes, 0)).toEqual([]);
});

test('a new network source recalculates priority instead of retaining old hubs', () => {
  const nodes = [{ id: 'A' }, { id: 'B' }, { id: 'C' }];
  const original = rankNetworkNodes(nodes, [{ from: 'A', to: 'B' }, { from: 'A', to: 'C' }]);
  const next = rankNetworkNodes(nodes, [{ from: 'C', to: 'A' }, { from: 'C', to: 'B' }]);
  expect(original[0].id).toBe('A');
  expect(next[0].id).toBe('C');
});
