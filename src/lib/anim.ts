/**
 * Shared motion transition presets so onboarding, toasts and any future
 * animated surface speak one vocabulary. Import as `import * as anim` and
 * read `anim.elastic` / `anim.spring` at the call site (path is the namespace).
 */
import type { Transition } from "motion/react";

/** Smooth, low-overshoot spring — default for layout reflow and collapses. */
export const spring: Transition = {
  type: "spring",
  stiffness: 360,
  damping: 30,
  mass: 0.9,
};

/** Bouncy, noticeably elastic spring — for "this is done" confirmations. */
export const elastic: Transition = {
  type: "spring",
  stiffness: 460,
  damping: 17,
  mass: 0.9,
};

/** Snappy spring for small enter/exit (toasts, badges). */
export const snappy: Transition = {
  type: "spring",
  stiffness: 520,
  damping: 28,
  mass: 0.7,
};
