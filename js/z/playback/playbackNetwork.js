// Host adapters for the pure Kotlin network policies. No debrid resolution is spent on a test.
import { ThroughputWindow } from "../../core/z/network/throughputWindow.js";
import { canProbeRequestHeaders } from "../../core/z/playback/playbackSourceProbe.js";
import {
  measurementPlan,
  measuredRate,
  MAX_TRANSFER_MS,
  PROBE_DEADLINE_MS,
  ESTIMATE_MAX_AGE_MS,
  settlementState,
  settleDeadline,
  settleProbe
} from "../../core/z/network/networkMeasurement.js";

const STORAGE_KEY = "zPlaybackNetworkEstimates";
const sessionNetwork = `session:${Date.now()}`;
// AbortController arrived after Tizen 4's browser. These jobs only need cancellation events,
// so retain an equivalent local signal on engines without the native class.
export function playbackCancellation() {
  if (typeof AbortController === "function") return new AbortController();
  const listeners = new Set();
  const signal = {
    aborted: false,
    addEventListener: (_, listener) => listeners.add(listener),
    removeEventListener: (_, listener) => listeners.delete(listener)
  };
  return {
    signal,
    abort() {
      if (signal.aborted) return;
      signal.aborted = true;
      listeners.forEach((listener) => listener());
      listeners.clear();
    }
  };
}
export function networkIdentity() {
  try {
    const api = globalThis.webapis?.network;
    const ip = api?.getIp();
    const gateway = api?.getGateway();
    if (ip && gateway) return `${api.getActiveConnectionType()}:${gateway}:${ip}`;
  } catch {
    /* Without permission or an identifiable network, do not restore a past network. */
  }
  return sessionNetwork;
}
export function createNetworkEstimates({
  storage = globalThis.localStorage,
  now = Date.now,
  network = networkIdentity
} = {}) {
  let entries = [];
  let lastPersistAt = 0;
  try {
    entries = JSON.parse(storage?.getItem(STORAGE_KEY) || "[]").filter(
      (entry) => entry && Number.isFinite(entry.mbps) && entry.mbps > 0 && Number.isFinite(entry.at)
    );
  } catch {
    /* Corrupt cache is not evidence. */
  }
  const provider = (value) =>
    String(value || "")
      .trim()
      .toLowerCase() || null;
  const live = (id) =>
    entries.find(
      (entry) =>
        entry.network === network() &&
        entry.provider === provider(id) &&
        now() - entry.at >= 0 &&
        now() - entry.at < ESTIMATE_MAX_AGE_MS
    );
  return {
    peek(id = null) {
      return (live(id) || live(null))?.mbps ?? null;
    },
    age(id = null) {
      const entry = live(id);
      return entry ? Math.max(0, now() - entry.at) : null;
    },
    record(mbps, id = null, { forced = false, passive = false } = {}) {
      if (!Number.isFinite(mbps) || mbps <= 0) return;
      const old = live(id);
      const weight = passive ? 0.3 : 0.5;
      const blended =
        old && (passive || (!forced && old.thisSession))
          ? old.mbps * (1 - weight) + mbps * weight
          : mbps;
      const entry = {
        network: network(),
        provider: provider(id),
        mbps: Math.min(1000, Math.max(0.25, blended)),
        at: now(),
        thisSession: true
      };
      entries = entries.filter(
        (item) =>
          !(item.network === entry.network && item.provider === entry.provider) &&
          now() - item.at < ESTIMATE_MAX_AGE_MS
      );
      entries.push(entry);
      entries.sort((a, b) => b.at - a.at);
      entries = entries.slice(0, 32);
      try {
        if (!old || now() - lastPersistAt >= 5000) {
          storage?.setItem(
            STORAGE_KEY,
            JSON.stringify(entries.map(({ thisSession, ...item }) => item))
          );
          lastPersistAt = now();
        }
      } catch {
        /* Playback works with a memory-only cache. */
      }
    }
  };
}
export const PlaybackNetworkEstimates = createNetworkEstimates();

// XHR progress is available even on Tizen 4's Chromium 56. ArrayBuffer avoids decoding video as
// text, and abort releases it at the byte/time cap. Sampling never waits for the whole response.
export function measureTransfer(
  plan,
  { signal, xhrFactory = () => new XMLHttpRequest(), now = () => performance.now() } = {}
) {
  if (!canProbeRequestHeaders(plan.headers)) return Promise.resolve(null);
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve(null);
    const xhr = xhrFactory();
    const window = new ThroughputWindow();
    let first = null,
      bytes = 0,
      finished = false,
      transferTimer;
    const finish = (discard = false) => {
      if (finished) return;
      finished = true;
      clearTimeout(transferTimer);
      clearTimeout(deadline);
      signal?.removeEventListener("abort", cancel);
      const transferMs = first == null ? 0 : now() - first;
      const sample = {
        status: xhr.status,
        bytes,
        transferMs,
        sustainedMbps: window.sustainedMbps,
        peakMbps: window.peakMbps
      };
      xhr.abort();
      resolve(discard ? null : measuredRate(sample));
    };
    const cancel = () => finish(true);
    const deadline = setTimeout(cancel, PROBE_DEADLINE_MS);
    signal?.addEventListener("abort", cancel, { once: true });
    try {
      xhr.open("GET", plan.url, true);
      xhr.responseType = "arraybuffer";
      xhr.setRequestHeader("Range", `bytes=0-${plan.maxBytes - 1}`);
      Object.entries(plan.headers || {}).forEach(([name, value]) => {
        if (name.toLowerCase() !== "range") xhr.setRequestHeader(name, value);
      });
      xhr.onprogress = (event) => {
        if (finished) return;
        if (first == null) {
          first = now();
          window.record(0, 0);
          transferTimer = setTimeout(() => finish(), MAX_TRANSFER_MS);
        }
        bytes = event.loaded;
        window.record(now() - first, bytes);
        if (bytes >= plan.maxBytes || now() - first >= MAX_TRANSFER_MS) finish();
      };
      xhr.onload = () => finish();
      xhr.onerror = cancel;
      xhr.ontimeout = cancel;
      xhr.send();
    } catch {
      finish(true);
    }
  });
}

let inFlight = Promise.resolve();
// Each route/re-test owns a nonce and a cancellation scope. Addon arrivals do not restart it.
export function createConnectionSession({
  target = () => null,
  onChange = () => {},
  estimates = PlaybackNetworkEstimates,
  measure = measureTransfer,
  network = networkIdentity
} = {}) {
  let nonce = 0,
    settlement = { decision: -1, figure: -1 },
    controller,
    deadline,
    disposed = false,
    providerId = null;
  const state = () => ({ ...settlementState(settlement, nonce), mbps: estimates.peek(providerId) });
  return {
    state,
    start(force = false) {
      if (disposed) return;
      const ask = ++nonce;
      controller?.abort();
      clearTimeout(deadline);
      controller = playbackCancellation();
      const signal = controller.signal;
      const probeTarget = target() || {};
      providerId = probeTarget.providerId || null;
      const startedNetwork = network();
      const current = () => !disposed && ask === nonce && !signal.aborted;
      const inputs = () => ({
        sourceUrl: probeTarget.url,
        sourceHeaders: probeTarget.headers,
        providerId,
        sourceEstimateAgeMs: estimates.age(providerId),
        lineEstimateAgeMs: estimates.age(),
        isOffline: globalThis.navigator?.onLine === false,
        force
      });
      const finish = () => {
        if (current()) {
          clearTimeout(deadline);
          settlement = settleProbe(settlement, ask);
          onChange(state());
        }
      };
      if (!measurementPlan(inputs())) {
        finish();
        return;
      }
      deadline = setTimeout(() => {
        if (current()) {
          settlement = settleDeadline(settlement, ask);
          onChange(state());
        }
      }, PROBE_DEADLINE_MS);
      onChange(state());
      const run = async () => {
        if (!current()) return;
        const plan = measurementPlan(inputs());
        if (!plan) return finish();
        try {
          const rate = await measure(plan, { signal });
          if (current() && network() === startedNetwork && rate != null)
            estimates.record(rate, plan.providerId, { forced: force });
        } catch {
          /* A failed/CORS-blocked measurement leaves an honest unknown. */
        }
        finish();
      };
      inFlight = inFlight.then(run, run);
    },
    dispose() {
      disposed = true;
      clearTimeout(deadline);
      controller?.abort();
    }
  };
}
