// Host adapters for the pure Kotlin network policies. No debrid resolution is spent on a test.
import { ThroughputWindow } from "../../core/z/network/throughputWindow.js";
import { canProbeRequestHeaders } from "../../core/z/playback/playbackSourceProbe.js";
import { playbackPaint } from "./playbackPaint.js";
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
let anonymousNetworkRevision = 0;
let sessionNetwork = `session:${Date.now()}:${anonymousNetworkRevision}`;
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
  const live = (id, networkId) =>
    entries.find(
      (entry) =>
        entry.network === networkId &&
        entry.provider === provider(id) &&
        now() - entry.at >= 0 &&
        now() - entry.at < ESTIMATE_MAX_AGE_MS
    );
  return {
    peek(id = null, networkId = network()) {
      return (live(id, networkId) || live(null, networkId))?.mbps ?? null;
    },
    age(id = null, networkId = network()) {
      const entry = live(id, networkId);
      return entry ? Math.max(0, now() - entry.at) : null;
    },
    record(mbps, id = null, { forced = false, passive = false, networkId } = {}) {
      if (!Number.isFinite(mbps) || mbps <= 0) return;
      networkId ??= network();
      const old = live(id, networkId);
      const weight = passive ? 0.3 : 0.5;
      const blended =
        old && (passive || (!forced && old.thisSession))
          ? old.mbps * (1 - weight) + mbps * weight
          : mbps;
      const entry = {
        network: networkId,
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
// Rendering only reads the session snapshot. Network changes retire it immediately; the
// next probe samples identity again, and completion still checks the actual network.
export function watchPlaybackNetwork(onChange) {
  const api = globalThis.webapis?.network;
  const changed = () => {
    // Without an identifiable network, even memory-only estimates belong to the old link.
    sessionNetwork = `session:${Date.now()}:${++anonymousNetworkRevision}`;
    onChange();
  };
  let listener;
  try {
    listener = api?.addNetworkStateChangeListener(changed);
  } catch {
    /* Browser connectivity events remain available without Samsung's permission. */
  }
  globalThis.addEventListener?.("online", changed);
  globalThis.addEventListener?.("offline", changed);
  return () => {
    globalThis.removeEventListener?.("online", changed);
    globalThis.removeEventListener?.("offline", changed);
    try {
      if (listener != null) api.removeNetworkStateChangeListener(listener);
    } catch {
      /* A disconnected native service must not prevent route cleanup. */
    }
  };
}
// Each route/re-test owns a nonce and a cancellation scope. Addon arrivals do not restart it.
export function createConnectionSession({
  target = () => null,
  onChange = () => {},
  estimates = PlaybackNetworkEstimates,
  measure = measureTransfer,
  network = networkIdentity,
  prepare = playbackPaint,
  watchNetwork = watchPlaybackNetwork
} = {}) {
  let nonce = 0,
    settlement = { decision: -1, figure: -1 },
    controller,
    deadline,
    disposed = false,
    mbps = null,
    stopWatching;
  const state = () => ({ ...settlementState(settlement, nonce), mbps });
  const session = {
    state,
    start(force = false) {
      if (disposed) return;
      const ask = ++nonce;
      controller?.abort();
      clearTimeout(deadline);
      controller = playbackCancellation();
      const signal = controller.signal;
      const current = () => !disposed && ask === nonce && !signal.aborted;
      const finish = () => {
        if (current()) {
          clearTimeout(deadline);
          settlement = settleProbe(settlement, ask);
          onChange(state());
        }
      };
      deadline = setTimeout(() => {
        if (current()) {
          settlement = settleDeadline(settlement, ask);
          onChange(state());
        }
      }, PROBE_DEADLINE_MS);
      onChange(state());
      // Native identity/target reads can block the TV's main thread. Paint the initial
      // sheet/loading state first, then do them once per ask rather than per render.
      void prepare()
        .then(() => {
          if (!current()) return;
          stopWatching ??= watchNetwork(() => {
            if (disposed) return;
            mbps = null;
            session.start(true);
          });
          const probeTarget = target() || {};
          const providerId = probeTarget.providerId || null;
          const startedNetwork = network();
          mbps = estimates.peek(providerId, startedNetwork);
          const inputs = () => ({
            sourceUrl: probeTarget.url,
            sourceHeaders: probeTarget.headers,
            providerId,
            sourceEstimateAgeMs: estimates.age(providerId, startedNetwork),
            lineEstimateAgeMs: estimates.age(null, startedNetwork),
            isOffline: globalThis.navigator?.onLine === false,
            force
          });
          if (!measurementPlan(inputs())) return finish();
          onChange(state());
          const run = async () => {
            if (!current()) return;
            const plan = measurementPlan(inputs());
            if (!plan) return finish();
            let rate = null;
            try {
              rate = await measure(plan, { signal });
            } catch {
              /* A failed/CORS-blocked measurement leaves an honest unknown. */
            }
            if (current()) {
              const completedNetwork = network();
              if (completedNetwork !== startedNetwork) mbps = null;
              else {
                if (rate != null)
                  estimates.record(rate, plan.providerId, {
                    forced: force,
                    networkId: startedNetwork
                  });
                mbps = estimates.peek(providerId, startedNetwork);
              }
            }
            finish();
          };
          inFlight = inFlight.then(run, run);
        })
        .catch(() => finish());
    },
    dispose() {
      disposed = true;
      clearTimeout(deadline);
      controller?.abort();
      stopWatching?.();
    }
  };
  return session;
}
