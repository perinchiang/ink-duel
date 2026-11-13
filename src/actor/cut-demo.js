// Slowed study of the same cut keys used by live swipes; no combat rules are changed.
import { POSES, cutPoses, makePose, blendPose } from './poses.js';
const [windup, impact, follow] = cutPoses(-0.8, -0.6);
export const CUT_STUDY = [
  [0, 'idle', POSES.guardM], [0.8, 'idle', POSES.guardM],
  [1.6, 'windup', windup], [2.0, 'impact', impact],
  [2.55, 'follow', follow], [3.5, 'recover', POSES.guardM],
  [4.2, 'idle', POSES.guardM],
];
export function studyPose(time, out = makePose()) {
  const t = ((time % 4.2) + 4.2) % 4.2;
  const i = CUT_STUDY.findIndex((k, i) => i > 0 && k[0] >= t);
  const a = CUT_STUDY[i - 1], b = CUT_STUDY[i];
  const u = (t - a[0]) / (b[0] - a[0]);
  blendPose(a[2], b[2], u * u * (3 - 2 * u), out);
  return b[1];
}
