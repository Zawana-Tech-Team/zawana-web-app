/** Seconds; keep operational feedback short and avoid layout animation on data rows. */
export const motionTokens = {
  hover: 0.14,
  press: 0.12,
  popover: 0.2,
  dialog: 0.28,
  page: 0.28,
  ease: [0.22, 1, 0.36, 1] as const,
  spring: { type: 'spring' as const, stiffness: 420, damping: 36, mass: 0.8 }
};
export const pageEntrance = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: { duration: motionTokens.page, ease: motionTokens.ease } }
};
export const popoverMotion = {
  initial: { opacity: 0, y: -4, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: -2, scale: 0.98 },
  transition: { duration: motionTokens.popover, ease: motionTokens.ease }
};
