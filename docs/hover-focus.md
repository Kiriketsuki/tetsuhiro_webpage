# Hover focus

The lens pulls focus toward what the cursor rests on. Code: `src/scene/aerie/hover-focus.js`,
the second focal plane in `blurPx` in `src/scene/aerie/grade-pass.js`, and the wiring in
`updateLens` in `src/scene/scene-manager.js`.

## How it works

1. A 1x1 pass samples the scene depth texture at the cursor. It writes the log view depth in
   two bytes of an RGBA8 target. WebGL2 cannot read a depth texture back, so this pass is needed.
2. `readRenderTargetPixelsAsync` (three.js) reads the pixel into a pixel buffer, sets a fence and
   polls it on a timer. The CPU never waits on the GPU. At most one read is in flight, and the
   probe reads no more than once every 60 ms.
3. After the pointer rests for 150 ms, the newest depth read from that rest becomes the aim. A
   dead zone of 0.15 in log depth (about 16 percent) keeps the aim still, so the focus does not hunt.
4. A critically damped spring at 18 per second moves the hover focus to the aim in log depth.
   A weight eases the pull in and out with a 120 ms time constant.
5. The grade pass keeps the stop's focus and adds the hover focus as a second focal plane:
   `s = mix(s, h * mix(s, 1, cap), weight)`. The cap is 0.8. At the cap, the stop's subject
   takes at most 80 percent of the full blur, so it never goes fully soft.
6. The pull fades out as soon as a camera move starts. It comes back about 150 ms after the move
   settles, from a fresh depth read.
7. Phones have no lens, so they keep the stop's focus and run no probe. Reduced motion keeps the
   stop's focus too.

The city plane, the glass and the glow sprites write no depth. A pointer over the city, or over
the city through the glass, reads the far scene behind them. The lens then keeps the city sharp.
This is the Skytree case.

## Tuning

`HOVER_FOCUS` in `hover-focus.js` is a mutable object. On the dev server, change it live:

```js
const { HOVER_FOCUS } = await import('/src/scene/aerie/hover-focus.js')
HOVER_FOCUS.cap = 0.6
```

| Key | Value | Meaning |
| --- | --- | --- |
| `rest` | 150 | Pointer rest before the focus moves, in ms |
| `rate` | 18 | Spring rate per second. About 250 ms to settle |
| `dead` | 0.15 | Dead zone in log depth |
| `cap` | 0.8 | Share of the way from the stop's focus to the hovered depth |
| `clear` | 0 | Cursor clear patch while the hover focus holds. 0.4 was the old patch |

## Measurements (3 November 2026)

Lab: Playwright Chromium, RTX 4070 through ANGLE D3D11, 1440x900, pixel ratio 1, dev server.

| Measure | Result |
| --- | --- |
| Probe draw, GPU timer query | 0.005 ms median, 0.009 ms p95 |
| Probe CPU submit (draw and readback call) | 0.1 ms median, 0.2 ms max |
| Readback latency, fence to data | 6.4 ms median (timer poll at 4 ms) |
| Whole frame GPU, same focus, probe on / probe off | 1.11 / 1.16 ms median (no difference within noise) |
| Desktop, 4x CPU throttle, frame interval with hover / no cursor | 5.6 / 5.6 ms median, 0 long tasks |
| Desktop, 4x CPU throttle, submit CPU with hover / no cursor | 2.13 / 2.17 ms |
| Phone size 390x844, 4x CPU throttle, idle | 5.6 ms median, 0 long tasks, lens and probe off |
| Phone size, flight to the bedroom | 5.6 ms median, 38.9 ms max (the move start, also without this change) |
| Scene JS gzip | 198.01 kB before, 198.88 kB after (+0.87 kB) |

A timer query around the readback call alone read about 0.4 ms. That query spans the `gl.flush()`
inside `readRenderTargetPixelsAsync`, so it counts the idle gap between two submits, not GPU work.
The A/B frame test above shows no added frame time.

Timing of the Skytree case, from the end of the pointer move: the weight starts at about 150 ms,
and the focus is 90 percent of the way out at about 380 ms.

## Captures

- `hover-focus/strip.jpg`: the bedroom stop. Top: the stop's focus with no cursor, and the
  cursor resting on the Skytree through the glass. Bottom: frames from the pointer rest.
- `hover-focus/options.jpg`: the cursor patch at 0 (shipped) and 0.4 (old patch kept), and a
  cap of 0.6.
- `hover-focus/tower.jpg`: the overview. The cursor rests on the stair tower, the tower is
  sharp and the pad in front softens.
