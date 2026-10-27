import { Platform } from "../../platform/index.js";

// Keep catalogue appends short on Tizen. Initial row loading and provider page sizes
// retain their existing limits; later focus/scroll requests append the remaining items.
export function homePaginationChunkSize(rowLimit) {
  return Platform.isTizen() ? Math.min(rowLimit, 2) : rowLimit;
}
