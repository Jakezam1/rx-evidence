export function fuzzyMatchPassage(passage, textItems) {
  if (!passage || !textItems?.length) return null;
  const needle = passage.toLowerCase().trim();
  return textItems.find((item) => item.str?.toLowerCase().includes(needle.slice(0, 30)));
}
