# Procedural player: full-body cut acceptance

Default remains the ink/code player. `?character=rigged` remains experimental; new trouser meshes hide when that adapter is active. Opponent keeps the long robe and original arm shapes.

## Change
- Short coat hem reveals two continuous tapered trouser meshes, solved through actual knees to supported ankles. Staggered feet, bent knees, independent pelvis yaw and lateral/forward weight channels.
- Copy, blend and spring all carry pelvis/weight. Existing poses inherit the previous pelvis yaw proportion; swipe cuts explicitly lead with pelvis at impact and let chest carry follow-through.
- Feet no longer turn with chest twist; only one foot steps at once, with committed landing targets, and zero-dt hitstop freezes feet.
- Player sleeves use shaped tapered profiles overlapping the elbow; elongated closed palms follow sword/scabbard orientation. Offhand withdraws as counterbalance through the diagonal cut. Short hair ties replace long flying tails.
- Combat timings/damage/parry/draw/death rules and grip-to-tip direction are unchanged. Live swipe cuts use the revised keys, not demo-only variants.

## Reproducible inspection
`?demo=cut` loops a slowed study of the same `cutPoses(-0.8,-0.6)` keys, at a full-body camera. `?demo=cut&at=SECONDS` deterministically advances the real pose spring/feet at 120 Hz from idle, then freezes. Suggested captures: 0.7 idle, 1.6 windup, 2.0 impact, 2.55 follow, 3.1 recovery. Study is slowed interpolation, not actual combat timing; it does not run the combat Animator. `__game.study` exposes phase/time/pose. Default camera is deliberately unchanged.

`node tools/full-body-test.mjs` against port 5190 checks channel propagation, finite cuts, full-body support and bent knees, fixed foot yaw, eight-direction transitions, draw/dodge/kneel compatibility, hitstop, and a live auto-draw smoke run. Captures go to `shots/full-body-*.png`; matching comparison camera capture goes to `/tmp/ink-duel-after-fullbody.png`.

## Acceptance / observed results
Initial browser run passed idle/windup/impact/follow/recovered support (ankle error < 1e-15), finite vertices, planted feet, compatibility poses and six seconds of live auto-draw without page errors. Its screenshots were inspected: visible knees and weight transfer, opponent silhouette retained. These initial screenshots precede the final sleeve/palm/hair adjustments and are not final-art evidence.
Final build and `git diff --check` passed after sleeve/palm, short hair ties, foot-support and tube-basis fixes (existing large-chunk warning). CPU check of 100 extreme leg targets passed endpoint support; this is not anatomical correctness. Ordinary study cuts retain 0.46m upper/lower segments (observed hip–ankle span 0.667–0.811m). Intermediate browser runs hit Chrome Metal stalls and a bounded SwiftShader launch timeout. After the worker finished, the parent reran `node tools/full-body-test.mjs` successfully against the final source: all five phase captures, eight-direction/dodge/draw/kneel transitions, zero-dt foot freeze, and live auto-draw passed without page errors. Maximum transition ankle error was 1.91e-16m. Final `shots/full-body-*.png` and `/tmp/ink-duel-after-fullbody.png` were recaptured. Visual inspection confirms clearer knees/support and shorter hair ties, but not finished anatomical or martial-art quality. `ANGLE=swiftshader` remains an optional test backend.

## Hand / slash revision (pending Patrick's visual acceptance)
- Default free hand, rest and middle guard now sit low at the hip/back; swipe keys keep it at 0.73–0.76m. Shared rest/guard keys also lower the opponent's idle offhand. Explicit parry, draw, two-hand and sheath overrides remain intact.
- Swipe blade rotates across the lateral/vertical plane with forward clearance, rather than the old forward impact thrust. Hips, legs, weight and combat timing are unchanged. Impact is an intermediate raised crossing pose; the downward finish is in follow-through.
- Palm long axis follows wrist-to-knuckles/forearm instead of copying the sword's grip-to-tip axis. A small thumb/index ridge stays on the guard side (+0.034 along blade), distinct from the pommel side; it hides with the experimental rigged visual. This is a stylized grip cue, not articulated fingers or proof of anatomical correctness.
- `node tools/hands-test.mjs` passes 32 directional cuts: low left hand, orthogonal key edge/direction, actual IK-clamped blade-point transverse travel, reachable grip targets, wrist alignment, tip length, 16 phase/view screenshots and live swipe. Maximum target reach 0.542m (<0.58m); aggregate transverse/axial blade-point travel 77.31/14.28. Metrics do not establish martial-art authenticity or visual acceptance.
- Final `full-body-test.mjs`, build and diff check pass (existing bundle warning). Both bounded browser runs close their browsers. Front/side/back montage inspected: low free hand and an upper-to-lower blade sweep, unchanged supported legs. Normal-camera impact now exposes the blade above the shoulder; follow still has partial body occlusion, and the windup tip can approach/cross the close camera frame. These remain readability limitations, not a claim of perfect acceptance.
- Evidence: `shots/hands-front-phases.jpg` (idle/windup/impact/follow, row-major), `shots/hands-three-views.jpg` (rows windup/impact/follow; columns front/side/back), `shots/hands-{idle,windup,impact,follow}-{front,side,back,normal}.png`, and `shots/hands-live-cut.png`. Screenshots are local review artifacts, not committed.

## Limitations
- Procedural cloth, not anatomical skinning/finger articulation. No cloth collision. Extreme dodge/draw transitions may stretch the trouser chain to keep the shoe connected, rather than detach the ankle.
- Feet are locked in fighter-local space; no general world locomotion/contact solver added.
- Full-body study has readable framing; the original close gameplay camera still crops lower legs on some frames.
- Demo pose sampling is deterministic; background paper/ink generation is not a pixel-identical seeded render.
- Death animation input override noted by review is pre-existing and outside this visual change.
