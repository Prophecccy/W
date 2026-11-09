import { Transition, Variants } from "framer-motion";

/**
 * Tactical Endfield Physics Constants
 * Benchmarked from Linear, Apple HIG, Stripe, and Raycast.
 */

// Instant, tactile physical response for buttons, cards, and micro-haptics
export const SPRING_TACTILE: Transition = {
  type: "spring",
  stiffness: 520,
  damping: 30,
  mass: 0.75,
};

// Fluid FLIP layout reflow physics for list reordering, deletion, and insertion
export const SPRING_LAYOUT: Transition = {
  type: "spring",
  stiffness: 380,
  damping: 32,
  mass: 1,
};

// Modal, dialog, and command palette entry and exit spring
export const SPRING_MODAL: Transition = {
  type: "spring",
  stiffness: 420,
  damping: 32,
  mass: 0.9,
};

// Silky, smooth cubic-bezier curve matching Apple/Stripe standard [0.16, 1, 0.3, 1]
export const TRANSITION_SMOOTH: Transition = {
  duration: 0.2,
  ease: [0.16, 1, 0.3, 1],
};

// Snappy pop transition for checkmarks, badges, and icons
export const SPRING_POP: Transition = {
  type: "spring",
  stiffness: 580,
  damping: 26,
  mass: 0.7,
};

// Card tap / hover micro-motion variants
export const CARD_PRESS_VARIANTS: Variants = {
  idle: { scale: 1 },
  hover: { y: -2, transition: { duration: 0.15, ease: [0.16, 1, 0.3, 1] } },
  tap: { scale: 0.985, transition: { duration: 0.08 } },
};

// Modal spring reveal variants
export const MODAL_SPRING_VARIANTS: Variants = {
  hidden: { opacity: 0, scale: 0.95, y: -10 },
  visible: { 
    opacity: 1, 
    scale: 1, 
    y: 0, 
    transition: SPRING_MODAL 
  },
  exit: { 
    opacity: 0, 
    scale: 0.96, 
    y: -6, 
    transition: { duration: 0.14, ease: [0.16, 1, 0.3, 1] } 
  },
};

// Staggered list container variants
export const LIST_STAGGER_CONTAINER: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.035,
      delayChildren: 0.02,
    },
  },
};

// Individual item reveal within a staggered list
export const LIST_ITEM_VARIANTS: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.2, ease: [0.16, 1, 0.3, 1] },
  },
  exit: {
    opacity: 0,
    scale: 0.94,
    transition: { duration: 0.15, ease: [0.16, 1, 0.3, 1] },
  },
};
