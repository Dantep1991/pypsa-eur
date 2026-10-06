// Schema category names are presentation filters. Queries use the exact union
// of their model objects, never similarly named solution-file dimensions.
export function selectedResultCategories(selection) {
  return [...new Set(Array.isArray(selection?.categories) ? selection.categories
    : selection?.category ? [selection.category] : [])];
}

export function resultCategorySelection(categories, quantity) {
  const selected = [...new Set(categories)];
  return { categories: selected, category: selected.length === 1 ? selected[0] : '',
    categoryObjects: [...new Set(selected.flatMap(category => quantity?.category_objects?.[category] || []))] };
}

export function retainResultCategories(selection, quantity) {
  return resultCategorySelection(selectedResultCategories(selection)
    .filter(category => quantity?.categories?.includes(category)), quantity);
}

export function resultSelectionLabel(selection) {
  return selectedResultCategories(selection).join(', ') || selection.className;
}
