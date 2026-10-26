// Port of core/network/ThroughputWindow.kt. No app or platform imports.
export class ThroughputWindow {
  constructor(windowMs = 250, minWindowBytes = 1024 * 1024) {
    this.windowMs = windowMs;
    this.minWindowBytes = minWindowBytes;
    this.samples = [];
    this.checkpoints = [];
    this.stride = 64 * 1024;
    this.peakMbps = null;
    this.last = null;
  }
  record(ms, bytes) {
    if (ms < 0 || bytes < 0) return;
    this.last = { ms, bytes };
    const points = this.checkpoints;
    if (!points.length || bytes - points[points.length - 1].bytes >= this.stride) {
      if (points.length === 512) {
        this.checkpoints = points.filter((_, index) => index % 2 === 0);
        this.stride *= 2;
      }
      this.checkpoints.push(this.last);
    }
    this.samples.push(this.last);
    for (let i = this.samples.length - 2; i >= 0; i--) {
      const start = this.samples[i];
      if (ms - start.ms >= this.windowMs && bytes - start.bytes >= this.minWindowBytes) {
        this.peakMbps = Math.max(
          this.peakMbps || 0,
          ((bytes - start.bytes) * 8) / (ms - start.ms) / 1000
        );
        break;
      }
    }
    while (
      this.samples.length > 2 &&
      ms - this.samples[1].ms >= this.windowMs &&
      bytes - this.samples[1].bytes >= this.minWindowBytes
    )
      this.samples.shift();
  }
  get sustainedMbps() {
    const points = this.checkpoints;
    if (points.length < 2 || !(this.last?.bytes > 0)) return null;
    const startIndex = points.findIndex((point) => point.bytes >= Math.floor(this.last.bytes / 8));
    if (startIndex < 0) return null;
    const start = points[startIndex];
    const regionBytes = this.last.bytes - start.bytes;
    if (regionBytes < this.minWindowBytes || this.last.ms - start.ms < this.windowMs) return null;
    const blockBytes = Math.floor(regionBytes / 8);
    if (blockBytes <= 0) return null;
    const rates = [];
    let previous = startIndex;
    for (let block = 1; block <= 8; block++) {
      let end = previous;
      while (end < points.length && points[end].bytes < start.bytes + blockBytes * block) end++;
      if (end === points.length) break;
      const span = points[end].ms - points[previous].ms;
      const bytes = points[end].bytes - points[previous].bytes;
      if (span > 0 && bytes > 0) rates.push((bytes * 8) / span / 1000);
      previous = end;
    }
    return rates.length < 4
      ? null
      : rates.sort((a, b) => a - b)[Math.floor((rates.length - 1) / 2)];
  }
}
