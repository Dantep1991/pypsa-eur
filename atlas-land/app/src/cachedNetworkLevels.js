// The legacy country file and the declared full-network cache are aliases of
// the same slider resolution. Keep both filenames so either loaded file stays
// selected, but prefer the catalogue's declared cache when switching networks.
export function uniqueCachedNetworkLevels(levels, preferredFullFilename) {
  const result = [];
  for (const level of levels) {
    const existing = result.find((candidate) => (
      level.isFullNodal ? candidate.isFullNodal : candidate.filename === level.filename
    ));
    if (!existing) {
      result.push({ ...level, filenames: [level.filename] });
      continue;
    }
    if (!existing.filenames.includes(level.filename)) existing.filenames.push(level.filename);
    if (level.isFullNodal && level.filename === preferredFullFilename) {
      const filenames = existing.filenames;
      Object.assign(existing, level, { filenames });
    }
  }
  return result.sort((a, b) => a.sortOrder - b.sortOrder);
}
