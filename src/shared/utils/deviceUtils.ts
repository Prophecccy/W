/**
 * Device and Platform Detection Utility Primitives
 * Pure functions for deterministic testing and runtime evaluation.
 */

export function isAndroidDevice(userAgent: string): boolean {
  return /Android/i.test(userAgent);
}

export function isMobileViewport(width: number): boolean {
  return width <= 768;
}

export function isMobileDevice(
  userAgent: string,
  width: number,
  hasTouch: boolean
): boolean {
  if (isAndroidDevice(userAgent)) return true;
  if (isMobileViewport(width)) return true;
  if (hasTouch && width <= 900) return true;
  const isMobileUA = /iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);
  return isMobileUA;
}
