# Player character A

## Provenance

`public/models/swordsman-a.glb` is the user-approved textured, Mixamo-rigged
Tripo character, task `ec809d05-9efe-4d1d-8015-2fc9b0c0ffd7`, generated from
approved reference image A made with `gpt-image-2.5-sunburst`.

Tripo source report: **11,122 quad faces / 9,951 vertices**. These are not the
exported render counts. The triangulated GLB audit reports **19,428 triangles,
41,672 exported vertices** (UV/normal splits), one primitive, one skin with
65 joints, and an embedded 2,269,244-byte JPEG. No animation clips. Float
`WEIGHTS_0` sums range from 0.99999987 to 1.00000012; no zero/nonfinite weights.

## Integration

- Default: original procedural ink player. Patrick rejected the generated model
  as the default because its shading clashes and the sword/arm poses remain weak.
  `?character=rigged` opts into the experimental rigged **player only**;
  `?character=code` remains supported. Enemy stays procedural in either mode.
- Load/parse/rig-validation failure retains the procedural player and logs a
  warning. `player.visualStatus` exposes `loading`, `rigged`, `code`, or
  `fallback`; screenshot `window.__ready` waits for loading to settle and a
  rendered frame.
- `RiggedVisual` reads `Swordsman`'s solved pose after feet are updated. It does
  not change combat, springs, weapon transforms, scabbard, or collision/query
  methods. Hidden primitive parts continue to provide those transforms.
- Export calibration: Y-up / +Z forward / -X right, uniform scale 1.75.
  Bind-world quaternions and child directions are captured before attaching
  under the player's yaw. Bone names tolerate GLTFLoader's colon sanitization.
  Desired character-frame rotations are converted through the actual parent
  world quaternion, rather than treating Mixamo local axes as world axes.
- Arms fit gameplay shoulder/wrist positions; wrist offsets put the palm grip
  centre at the unchanged hilt. Visual bone translations fit the source's
  shorter arms to gameplay proportions, with slight extension at full reach.
  Hand across-palm axes follow sword/scabbard axes. Three joints per finger
  curl with mirrored palm signs; free left hand relaxes.
- Legs use source segment lengths and forward knee poles toward planted foot
  targets. Foot orientation follows the original foot yaw. Standard textured
  GLTF materials retain built-in skinning; hemisphere/key lighting is added.
  Imported materials are DoubleSide: a front close-up confirmed that backface
  culling exposed a white armpit slit, and double-sided rendering removed it.
  The primitive ink shaders are deliberately not assigned to skinned meshes.

## Verification

Run Vite on port 5190, then `node tools/rig-test.mjs`. It checks eight poses,
finite bone matrices, palm-to-hilt error (< 1e-5), primitive visibility,
unchanged enemy/sword visibility, code mode, aborted-asset fallback, and eight
seconds of live auto-draw combat without page errors.

`npm run build` passes (Vite reports the >500 kB bundle advisory).

Real Chrome screenshots via `tools/shot.mjs`, visually inspected:

- `shots/rigged-rest.png` (idle/rest)
- `shots/rigged-parryL.png`
- `shots/rigged-sheathed.png`
- `shots/rigged-drawCut.png`
- `shots/rigged-dodge1.png`
- `shots/rigged-idle.png` (default camera, guard preview)

Full-body framing uses
`?ppose=rest&cam=2.8,2.1,3.8&look=0,0.9,-0.6` (replace pose as above).
The existing close gameplay camera intentionally crops the player's legs.

Final normal-camera captures with HUD/dodge UI: `shots/rigged-gameplay.png`
(live idle), plus `shots/rigged-gameplay-{parryL,sheathed,drawCut,dodge1}.png`
(pose previews with `?skip&ppose=...`). Close front grip inspection is
`shots/rigged-hand-front.png`; boot inspection is `shots/rigged-boots.png`.
The front inspection confirms inward grip curls; the relaxed left wrist follows
its posed forearm rather than retaining its A-pose orientation. Skinned vertices
weighted primarily to foot/toe bones have rest-pose sole minima of 0.000415 m
(right) / 0.000356 m (left), effectively grounded, not floating.

Limitations: source clothing follows skin weights rather than cloth simulation;
extreme poses can crease the hem/sleeves. Grip curl is a calibrated procedural
approximation, not per-finger contact IK. Player uses textured PBR shading while
the opponent remains ink primitives. The old primitive hair ribbons are hidden
(the imported bun/hair supplies that silhouette); the weapon tassel stays active.
Screenshot console reports a missing favicon, not an asset/shader failure.
