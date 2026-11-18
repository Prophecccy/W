import { describe, it, expect } from "vitest";
import { isAndroidDevice, isMobileViewport, isMobileDevice } from "./deviceUtils";

describe("deviceUtils", () => {
  const DESKTOP_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
  const ANDROID_UA = "Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";
  const IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

  describe("isAndroidDevice", () => {
    it("returns true for Android user agents", () => {
      expect(isAndroidDevice(ANDROID_UA)).toBe(true);
    });

    it("returns false for Windows desktop user agents", () => {
      expect(isAndroidDevice(DESKTOP_UA)).toBe(false);
    });

    it("returns false for iOS user agents", () => {
      expect(isAndroidDevice(IPHONE_UA)).toBe(false);
    });
  });

  describe("isMobileViewport", () => {
    it("returns true for screens <= 768px", () => {
      expect(isMobileViewport(375)).toBe(true);
      expect(isMobileViewport(768)).toBe(true);
    });

    it("returns false for screens > 768px", () => {
      expect(isMobileViewport(769)).toBe(false);
      expect(isMobileViewport(1280)).toBe(false);
    });
  });

  describe("isMobileDevice", () => {
    it("returns true when running on Android UA regardless of width", () => {
      expect(isMobileDevice(ANDROID_UA, 1440, false)).toBe(true);
      expect(isMobileDevice(ANDROID_UA, 412, true)).toBe(true);
    });

    it("returns true when screen width <= 768px on desktop browser", () => {
      expect(isMobileDevice(DESKTOP_UA, 500, false)).toBe(true);
    });

    it("returns false for standard desktop resolutions without touch", () => {
      expect(isMobileDevice(DESKTOP_UA, 1280, false)).toBe(false);
      expect(isMobileDevice(DESKTOP_UA, 1920, false)).toBe(false);
    });

    it("returns true for touch tablets <= 900px", () => {
      expect(isMobileDevice(DESKTOP_UA, 820, true)).toBe(true);
    });
  });
});
