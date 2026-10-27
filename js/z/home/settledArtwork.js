import { Platform } from "../../platform/index.js";

// Match Home's existing 800 ms background-input quiet window for vertical
// previews on Tizen. Vanilla retains its timers, focus fences and enrichment.
const TIZEN_VERTICAL_HERO_SETTLE_MS = 800;

export function withSettledHomeArtwork(vanilla) {
  return {
    ...vanilla,
    scheduleModernHeroUpdate(node, options = {}) {
      const previous = this.zHomeArtworkVertical;
      this.zHomeArtworkVertical = Boolean(options.deferUntilVerticalSettle);
      try {
        return vanilla.scheduleModernHeroUpdate.call(this, node, options);
      } finally {
        this.zHomeArtworkVertical = previous;
      }
    },
    getHeroFocusDelay(options) {
      const delay = vanilla.getHeroFocusDelay.call(this, options);
      return Platform.isTizen() &&
        this.layoutMode === "modern" &&
        this.zHomeArtworkVertical &&
        this.shouldDeferHomeRenderForInput?.()
        ? Math.max(delay, TIZEN_VERTICAL_HERO_SETTLE_MS)
        : delay;
    }
  };
}
