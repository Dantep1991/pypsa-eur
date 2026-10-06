import { resultCategorySelection, retainResultCategories, resultSelectionLabel } from './resultCategories';

test('category union is exact, deduplicated, compatible and named in overlay receipts', () => {
  const quantity = { categories: ['One', 'Two'], category_objects: { One: ['A', 'C'], Two: ['B', 'C'] } };
  const selection = { ...resultCategorySelection(['One', 'Two', 'One'], quantity), className: 'Node' };
  expect(selection).toMatchObject({ categories: ['One', 'Two'], category: '', categoryObjects: ['A', 'C', 'B'] });
  expect(resultSelectionLabel(selection)).toBe('One, Two');
  expect(resultSelectionLabel({ category: 'One', className: 'Node' })).toBe('One');
  expect(resultSelectionLabel({ categories: [], className: 'Node' })).toBe('Node');
  expect(retainResultCategories(selection, { ...quantity, categories: ['Two'] })).toMatchObject({ categories: ['Two'], categoryObjects: ['B', 'C'] });
});
