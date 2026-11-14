# Normal-camera cut visibility (cb49deb follow-up)

Scope: procedural player's swipe cut only. No camera, rendering, model, left-hand,
blade direction/edge, stance, pelvis or root changes. The follow grip finishes at
shoulder height (canonical diagonal: 1.34 vs 1.048), with slightly *less* lateral
travel (0.55 vs 0.56). A dedicated `elbowR` pose/spring channel leads the elbow
forward for cut keys, keeping the sleeve off the grip. All other keys retain the
original -0.35 elbow pole, including guard/parry/draw/sheath; enemy unchanged.

## Evidence

`shots/visibility-before/` is captured before production edits; `visibility-after/`
has idle/windup/impact/follow × normal/front/side, plus actual pointer-swipe live
windup/impact/follow. Normal view uses unchanged gameplay camera constants and
1280×900 responsive projection, not the wider demo camera.

Opaque body mesh raycasts (not just clip bounds), 20 blade centerline samples:

| Phase | Before visible blade | After | After hand center |
|---|---:|---:|---|
| idle | 90% | 90% | occluded |
| windup | 95% | 100% | occluded |
| impact (study) | 100% | 100% | clear |
| follow | 35% | 90% | clear |

These are geometric centerline tests against body surfaces, not pixel coverage;
ink hulls, hand silhouette and enemy/environment overlaps are not included.
Normal follow/front screenshots show a bent cross-body arm, not a wide straight
outreach. Side camera is on the far side and still naturally hides that arm.

Real mouse drag goes through the input handler (not demo keys/synthSwipe), with
Playwright clock steps 32/64/128 ms. At sampled live follow, hand is clear and
90% blade centerline clear. Live impact hand remains partly occluded despite
study impact being clear: **not a claim that all transition frames are clear**.
Idle and windup hand occlusion remains. Canonical windup tip NDC y=0.898 fits
this viewport; other swipe directions/aspect ratios were not proven unclipped.

## Verification

- `tools/visibility-test.mjs`: asserts study impact/follow hand clearance and
  >=85% blade visibility; also asserts actual live spring follow. Metrics JSON
  and PNGs retained in the above directories. Before mode: `LABEL=before`.
- `tools/hands-test.mjs`: PASS, 32 directions; max requested reach 0.572 < 0.58;
  transverse travel 76.03 vs axial 11.64; wrist alignment and 16 views pass.
- `tools/full-body-test.mjs`: PASS, planted feet, eight-direction transitions,
  compatibility poses including parry/draw/sheath, hitstop, live combat.
- `npm run build`: PASS (existing >500 kB chunk warning).

System Chrome launch timed out once and exited. Tests completed using installed
Chrome headless shell via `CHROME_PATH` and Metal; all owned browsers closed in
finally blocks with watchdog bounds. Test scripts default to system Chrome.
