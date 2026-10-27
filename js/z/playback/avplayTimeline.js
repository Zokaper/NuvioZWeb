// UI, subtitle and watchdog readers share one native sample. Samsung also updates the
// cached clock through oncurrentplaytime; a getter must not make every reader do IPC.
const samples = new WeakMap();
export function shouldRefreshAvPlayTimeline(controller, now = performance.now()) {
  const key = [
    controller.playRequestToken,
    controller.avplayUrl,
    controller.avplaySeekRequestToken,
    controller.avplayReady,
    controller.avplayEnded
  ];
  const previous = samples.get(controller);
  if (
    previous &&
    now >= previous.at &&
    now - previous.at < 250 &&
    key.every((value, index) => value === previous.key[index])
  )
    return false;
  samples.set(controller, { at: now, key });
  return true;
}
