export type Vec3 = readonly [number, number, number];
export type CameraKeyframe = { at: number; position: Vec3; target: Vec3; fov: number };
export type Chapter = { id: string; label: string; at: number; end: number; lines: readonly string[]; copy: string };

export const chapters: readonly Chapter[] = [
  { id: 'reveal', label: 'The reveal', at: 0, end: .2, lines: ['BEYOND', 'THE GAME.'], copy: 'A shared passion. A new perspective. Step into a world built around movement.' },
  { id: 'impact', label: 'The impact', at: .2, end: .4, lines: ['EVERY MOVE', 'MATTERS.'], copy: 'The focus before the first serve. The feeling after the perfect rally. This is where it begins.' },
  { id: 'arena', label: 'The arena', at: .4, end: .65, lines: ['THIS IS', 'YOUR ARENA.'], copy: 'Find your rhythm. Own your next rally. Make space for the game you love.' },
  { id: 'explore', label: 'The ecosystem', at: .65, end: .85, lines: ['MORE THAN', 'A GAME.'], copy: 'Play. Perform. Recover. Recharge. One destination, connected by your ambition.' },
  { id: 'book', label: 'Your moment', at: .85, end: 1, lines: ['YOUR COURT.', 'YOUR GAME.'], copy: 'Turn the feeling into your next session. Choose your court and time in our booking experience.' },
];

// One conceptual regulation court. These frames do not describe the real building or its layout.
export const cameraKeyframes: readonly CameraKeyframe[] = [
  { at: 0, position: [11, 6, 18], target: [-3, 1.7, 0], fov: 42 },
  { at: .16, position: [9, 5, 15], target: [-2.3, 1.6, 0], fov: 42 },
  { at: .27, position: [6.5, 4.5, 12], target: [-1.8, 2, 0], fov: 43 },
  { at: .4, position: [1.5, 3.4, 9.6], target: [-1.2, 1.3, -2], fov: 48 },
  { at: .53, position: [8, 7.5, 12], target: [-2, .7, 0], fov: 44 },
  { at: .65, position: [11, 11, 13], target: [-2.5, .3, 0], fov: 44 },
  { at: .85, position: [3, 18, 6], target: [-3, 0, 0], fov: 44 },
  { at: 1, position: [-4, 22, .1], target: [-4, 0, 0], fov: 43 },
];

export const shuttleKeyframes: readonly { at: number; position: Vec3; scale: number }[] = [
  { at: 0, position: [13, 6, -4], scale: .45 },
  { at: .15, position: [10, 6, 1], scale: .65 },
  { at: .23, position: [5.4, 4.1, 5.8], scale: .95 },
  { at: .3, position: [4.7, 3.7, 7], scale: 1.25 },
  { at: .36, position: [.9, 3.2, 9], scale: 1.45 },
  { at: .4, position: [-5, 3, 12], scale: .35 },
  { at: .48, position: [-8, 1.8, -5], scale: .08 },
  { at: 1, position: [-8, 1.8, -5], scale: .08 },
];

export const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
export const smoothstep = (value: number) => { const t = clamp01(value); return t * t * (3 - 2 * t); };
export function chapterAt(progress: number) {
  // Browser scroll positions round to pixels; chapter boundaries should remain stable.
  const index = chapters.findIndex(chapter => progress + .0003 < chapter.end);
  return index < 0 ? chapters.length - 1 : index;
}
export function segmentAt<T extends { at: number }>(frames: readonly T[], progress: number) {
  const next = frames.findIndex(frame => frame.at > progress);
  const index = next < 0 ? frames.length - 2 : Math.max(0, next - 1);
  const from = frames[index], to = frames[index + 1];
  return { from, to, mix: clamp01((progress - from.at) / (to.at - from.at)), index };
}
