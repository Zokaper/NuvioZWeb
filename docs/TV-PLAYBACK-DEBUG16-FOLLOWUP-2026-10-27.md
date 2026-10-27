# Debug 16: countdown, Back and dead-source follow-up

The maintainer reports that the installed build looks good, with source-loading stutter still
present but acceptable for now. They cannot do another playback test at this checkpoint and
authorized agent testing on the available TV instead. Further startup tuning is deferred.

## Device and scope

These checks ran against the already installed, configured, signed debug 16 on the Samsung Q60B
(Tizen 6.5), using its inspector and the paired network remote. No application code, saved playback
mode, preference or autoplay setting was changed. The playback mode was Instant. Existing MobLand
episode metadata and working addon sources supplied the live playback legs.

The automatic path was entered through the installed player's
`playNextEpisode({ userInitiated: false })` method. **Natural end-of-episode threshold triggering
was not exercised.** This checks the actual automatic search/countdown/commit branch, rather than
claiming an unattended full-episode test. Instrumented clocks and frame flags do not establish
physical picture or audio quality.

## Results

| Check                                      | Observed result                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Automatic-origin episode 1 to episode 2    | Countdown displayed 3, 2, 1 over about 2.94 seconds of sampled time. The old playback clock advanced from 58.865 to 61.860 seconds during countdown, with no loading host or player loading flag in those samples. Episode 2 reached presented playback, cleared loading and the strict audio gate, and advanced beyond five seconds with both startup language-preference flags applied.                                                                          |
| Back during automatic countdown            | Paired network remote sent `KEY_RETURN` during episode 2's countdown to episode 3. Transition returned to `IDLE`, launch resolved `false`, and episode 2 continued from 16.732 to 22.759 seconds across a six-second follow-up. No episode swap, loading flag or loading host appeared in that follow-up.                                                                                                                                                          |
| Ordinary controlled HTTP 404 source        | A temporary LAN server returned actual HTTP 404 responses. The installed source probe rejected the first candidate after about 734 ms. The failure chain advanced once to the known working episode-2 source and reached presented playback with loading/gate cleared and both language-preference flags applied.                                                                                                                                                  |
| Native failure with XHR probe inapplicable | A second HTTP 404 candidate carried a native-only User-Agent header, making the XHR side probe inapplicable under the shipped policy. The server received requests with that marker. AVPlay reported `PLAYER_ERROR_CONNECTION_FAILED` after about 3.49 seconds. Two error reports for the same failed candidate advanced the chain only once; the working second candidate reached presented playback with loading/gate cleared and both preference flags applied. |

Both failover cases had zero sampled turns with no frame, no loading flag and no loading host.
Samples were taken at roughly 100 ms intervals, so this does not exclude shorter visual gaps.
The controlled candidates were supplied in runtime route parameters; production source discovery,
ranking and provider outages were not reproduced by these fixtures. No error handler was invoked
artificially to manufacture a failure. Timing samples are individual observations, not averages.

An initial cancellation harness incorrectly expected a `CANCELLED` phase. The shipped transition
model returns to `IDLE`; the harness expectation was corrected and the remote-Back check rerun
successfully. No production fix was needed.

## Handoff

Temporary harnesses and sanitized observations remain in ignored `.cache/tv-perf/acceptance16*`.
The HTTP fixture and remote connections were closed. The TV app was terminated and relaunched
normally, clearing runtime wrappers/globals, and inspector forwarding was removed.

This is a verification/documentation change only; debug 16 remains installed and no new debug
build is needed. The existing 493-test result is unchanged; the suite was not rerun for these
documentation edits. Remaining acceptance includes natural autoplay threshold triggering,
Classic/Streamlined automatic transitions, chain exhaustion/manual escape on hardware, physical
picture/sound assessment and other TV families. None needs to block independent navigation
performance work or preparing UI previews for maintainer review.
