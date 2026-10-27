# Debug 17: shorter Tizen Home catalogue appends

The maintainer authorized Home/navigation performance work without another playback test.
This pass measures the installed Samsung Q60B at its actual 1920×1080 UI resolution. Saved Home
layout and playback settings were retained. No playback, visual design or theme policy changed.

## Finding and change

Modern Home's pagination callback builds markup, parses it, registers DOM nodes and extends the
navigation model for a whole row-sized batch in one turn. The Q60B initially renders 15 catalogue
cards per row. A first traced append took about 138 ms. A warm same-row replay, resetting only its
runtime DOM tail to the initial 15 cards, measured a 15-card append at **63.1 ms**.

`js/z/home/rowPagination.js` limits later Tizen DOM appends to **two cards per request**. A single
import/call seam in `homeScreenMethods-29-setup-modern-track-scroll-pagination.js` applies that
limit. The initial row size, provider fetch size, cached page contents, order, pagination offsets,
four-item load-ahead policy and existing lifecycle/in-flight guards remain authoritative. Later
focus and scroll requests mount the remaining cached items. Browser and webOS retain their
existing batch size. There is no new scheduler, dependency, persisted setting or DOM replacement.

This is inherited code on the stated vanilla 1.2.9 base, changed to address the roadmap's Stage 3
navigation gate. Upstream was fetched to `50d1a57f` on 2026-10-27; this pagination file has no
changes after base `c8674f2d`. The seam is **drop-at-next-sync** when upstream bounds the same work.
The canonical patch ledger and vanilla-bug register record it.

## Measurements and limits

| Observation                            | Result                                                                                                                                            |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Warm original, same row/input sequence | One 15-card append: 63.1 ms.                                                                                                                      |
| Two-card runtime comparison            | Four append turns: 21.9, 15.7, 10.4 and 10.4 ms.                                                                                                  |
| Installed configured signed debug 17   | Four append turns: 19.8, 11.9, 10.7 and 8.8 ms.                                                                                                   |
| Installed 38-key remote sequence       | Horizontal traversal, six rows down/up and sidebar down/up/return; one connected focus node, Home route retained, no uncaught runtime exceptions. |

These are individual observations, not repeated-run averages. Warm comparison runs use the same
cached catalogue and paired remote clicks; the installed build has its own fresh DOM. Pagination
callback durations include markup/DOM/navigation work, not a complete presented-frame latency.

**The overall navigation budget is not met by this change.** Installed handler p95 was 29.0 ms,
against a 16.7 ms working target; frame-gap p95 was 41.4 ms and its maximum 394.5 ms. Warm old/new
runs likewise do not establish a frame-rate improvement. The first trace identifies substantial
image/compositing work, alongside style/focus and hero-update costs. Its largest input task includes
profiler startup overhead, so that task is excluded from the optimization comparison. Inspector
instrumentation and next-rAF timing do not establish physical remote-to-picture latency.

A native-focus ordering prototype reduced the measured focus call but moved style/layout cost
into the next geometry read, with no reliable overall benefit. It is excluded. Effects, image
quality and layout were not reduced to manufacture a result.

## Verification and handoff

497/497 Z tests pass, including four integration checks executing the real Home pagination method
with the real Z policy: cached ordering/navigation columns, full provider-page retention and skip,
non-Tizen batch preservation, and teardown/late-response fencing. Only app/data boundaries and the
markup parser are stubbed; no pagination logic is copied into the tests. Lint and configured Tizen
and webOS packaging pass. The focused upstream Home poster-settings test also passes.

On the installed build, 95 paired-remote Right clicks reach index 95, crossing the original
cached-page boundary: 108 mounted cards, 143 cached items, all mounted items ordered and unique.
Details/Back restores the same visible focus. Another 95 Left clicks return to index zero.
The earlier 50-card round trip also passes. This checks later cached appends and a live provider
page extension without imposing a two-card total cap. These are clicks, not a physical held-key
repeat test. Final publication and normal relaunch are recorded in STATUS.

The configured signed WGT installed on the Q60B has SHA-256
`3726f40c6d01baf2634a420e5b5fadfb189eab8ac88e8b7f006fd58bc23b77a7`.
Temporary measurement scripts, traces and sanitized results live only in ignored
`.cache/tv-perf/home17*`. Production code contains no profiler or test globals.

Further image/compositing work and the full physical navigation/other-TV matrix remain open.
Debug 16's playback acceptance and remaining source-loading stutter are unchanged by this Home pass.
