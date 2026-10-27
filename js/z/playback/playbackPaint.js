// Let the current loading/skeleton update reach the compositor before native startup work.
export function playbackPaint() {
  return new Promise((resolve) => {
    const fallback = setTimeout(resolve, 50);
    if (typeof requestAnimationFrame === "function")
      requestAnimationFrame(() =>
        setTimeout(() => {
          clearTimeout(fallback);
          resolve();
        }, 0)
      );
  });
}
