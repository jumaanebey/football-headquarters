import type { heroSignaturePose } from '../game/heroSignaturePresentation';

/** Small football cues keep the player readable at squad size. Projectiles and
 * real effect radii remain owned by the field renderer; these imply no hits. */
export function paintHeroSignatureCue(ctx: CanvasRenderingContext2D, pose: ReturnType<typeof heroSignaturePose>) {
  if (pose.cueOpacity <= 0 || pose.cue === 'ball' || pose.cue === 'kick') return;
  ctx.save();
  ctx.globalAlpha = pose.cueOpacity * .85;
  ctx.strokeStyle = pose.color; ctx.fillStyle = pose.color;
  ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath();
  if (pose.cue === 'recover') {
    // Trainer's kit marker, distinct from a generic glowing power effect.
    ctx.moveTo(302, 104); ctx.lineTo(302, 136); ctx.moveTo(286, 120); ctx.lineTo(318, 120);
  } else if (pose.cue === 'protect') {
    ctx.moveTo(92, 180); ctx.lineTo(115, 191); ctx.lineTo(111, 218);
    ctx.quadraticCurveTo(104, 232, 92, 240); ctx.quadraticCurveTo(80, 232, 73, 218);
    ctx.lineTo(69, 191); ctx.closePath();
  } else if (pose.cue === 'rally') {
    ctx.arc(85, 159, 18, -.6, .6); ctx.moveTo(114, 141); ctx.arc(85, 159, 34, -.6, .6);
  } else if (pose.cue === 'captain') {
    for (const [x, y] of [[91, 114], [313, 114], [307, 150]]) {
      ctx.moveTo(x - 7, y); ctx.lineTo(x + 7, y); ctx.moveTo(x, y - 7); ctx.lineTo(x, y + 7);
    }
  } else if (pose.cue === 'route') {
    ctx.setLineDash([9, 8]); ctx.moveTo(305, 337); ctx.lineTo(263, 337); ctx.lineTo(235, 358);
  } else if (pose.cue === 'speed') {
    for (const [y, x] of [[223, 282], [246, 300], [270, 275]]) { ctx.moveTo(x, y); ctx.lineTo(x + 29, y); }
  } else {
    // Turf scuffs under a planted shoulder drive, never a fist or blast.
    ctx.moveTo(63, 365); ctx.lineTo(44, 357); ctx.moveTo(92, 373); ctx.lineTo(72, 379);
    ctx.moveTo(310, 367); ctx.lineTo(332, 360);
  }
  ctx.stroke(); ctx.restore();
}
