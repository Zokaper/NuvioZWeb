// Bound expensive badge markup and DOM work when opening the in-player source panel.
// Indices remain absolute: focus and activation still address the complete source catalogue.
export function sourceWindow(streams, focus, radius = 6) {
  const size = radius * 2 + 1;
  const index = focus?.zone === "list" ? Number(focus.index) || 0 : 0;
  const start = Math.max(0, Math.min(index - radius, streams.length - size));
  return { start, items: streams.slice(start, start + size) };
}
