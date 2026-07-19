/**
 * Replace the filter controls without replacing the scroll container itself.
 * Keeping the element instance is important on Android WebView: replacing a
 * scrollable node resets its scrollTop even when the surrounding sheet stays
 * open.
 */
export function updateFilterSheetPreservingScroll(sheet, nextSheet) {
  const current = sheet?.querySelector?.(".collection-filters");
  const next = nextSheet?.querySelector?.(".collection-filters");
  if (!current || !next) return false;

  const scrollTop = current.scrollTop;
  current.innerHTML = next.innerHTML;
  current.scrollTop = scrollTop;
  return true;
}
