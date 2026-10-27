# Q60B loading and handoff performance

The maintainer reports that overall performance is good. This pass targets the reported loading
stutter and abrupt playback transitions; it is not a claim that the rest of the UI needs rewriting.
Their first debug 12 test is recorded in `STATUS.md`. No additional maintainer acceptance is implied.

## Hardware measurements

Measured on the actual Samsung QA60Q60BAUXSA, Tizen 6.5 / Chromium 85, at its 1920x1080 UI
viewport. SDB launches the installed app in debug mode; its forwarded CDP connection supplies CPU
profiles, frame intervals, controller timings and DOM mutation observations. No browser emulation
or synthetic CPU throttling is represented as TV performance.

The same existing title supplied **126 sources**. No addon URLs, credentials, profile identifiers
or signed packages belong in this report. Raw traces and local helpers remain in ignored
`.cache/tv-perf/`.

| Measurement                                                           | Before                                                | After                                                                  |
| --------------------------------------------------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------- |
| Eight repeated quality-option calls                                   | Every call **539-675 ms**                             | Installed build: initial **779 ms**, then **0.055-0.080 ms**           |
| Loading-host child replacement during sampled handoff                 | **3** full replacements                               | **0** full replacements                                                |
| Title, progress node and loading host retained through player handoff | Nodes replaced with changed stage/facts/escape markup | All retained in **11** mutation observations                           |
| Exit into video                                                       | Immediate removal                                     | **300 ms** fade, observed only after the player's presented-frame flag |

The initial catalogue calculation is still synchronous and can pause the main thread. Caching
removes repeated work, not the first calculation. New source records, changed source ordering and
a new selection context invalidate the result. Source discovery and debrid preparation publish
replacement records, so changes to a prepared source are not hidden by the facts cache. Each
new mount owns a new cache, which cleanup releases. Ranking, source eligibility, selection and
failure budgets are unchanged.

These are operation and DOM-continuity measurements, **not an end-to-end FPS improvement claim**.
The two sampled flows had different network/player timing. Frame gaps still reached seconds after
the change. In the earlier 25-second replay profile, approximately 6.2 seconds accumulated inside
native synchronous calls; stacks include AVPlay timeline refreshes from UI, subtitle and watchdog
readers. Native startup/polling is a separate remaining investigation. The largest individual
startup stalls are not fixed or conclusively attributed by this chunk, and no vanilla-build
reproduction is claimed.

## Changes and verification

- A Z-owned options cache keeps extracted facts by source record and derived options by source
  snapshot/context. The connection probe also obtains its best option once instead of twice.
- Loading updates touch only changed sections. The logo, title wrapper, fact-band wrapper and
  progress animation survive stage changes, the route handoff and retries.
- The backdrop stays still. Title and band use Kotlin's 40/80 ms stagger and finish at 260 ms.
  Only the first-frame exit fades the whole surface. Back/manual exits remain immediate; a new
  play cancels an old exit, and reduced-motion preference skips these transitions.
- **459/459** Z tests pass, including cache reuse and fresh-output parity against the real uncached
  implementation for discovery, prepared replacement, preference changes and reordering. Lint,
  formatting, configured production build and Tizen/webOS packaging pass.
- Browser checks execute the real loading module: stable nodes, manual callback, 1080p bounds,
  first-frame fade, repeated ticks during exit, new play during exit, immediate Back and reduced
  motion. The rendered title/fact band remains inside the safe area.
- Configured signed debug 13 code installed and launched on the Q60B. Inspector checks confirm
  actual Instant discovery-to-playback, presented video, persistent nodes, the entrance animations
  and frame-gated exit. This is instrumented hardware verification, **not a maintainer visual
  smoothness verdict**, nor acceptance of Classic, Streamlined, physical failover or next episode.
- No new upstream-owned file, runtime dependency, account setting or selection rule changed.
  TMDB defaults and the Details/audio UI reports remain for the later settings/player review.

The laptop lost power during the pass. On resumption, existing changes and traces were recovered,
the TV was woken using the locally cached network record, and the installed production bundle was
checked to exclude the temporary profiling globals. Broader screen transitions remain in the UI
pass; this chunk adds motion to the playback loading entrance and first-frame handoff.

Code `0e547bf2` is published as [debug 13](https://github.com/Zokaper/NuvioZWeb/releases/tag/debug-v1.2.9-z1.13)
(WGT + IPK), [run 40426439290](https://github.com/Zokaper/NuvioZWeb/actions/runs/40426439290).
The public CI packages are unconfigured because the optional config secret is absent; the
configured signed local WGT is the one installed on the Q60B. The app was relaunched in normal
mode and the inspector forwarding removed after verification.
