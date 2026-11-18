import { useState, useEffect } from "react";
import { isTauri } from "../utils/tauri";
import { isAndroidDevice, isMobileDevice } from "../utils/deviceUtils";

export interface DeviceContextValue {
  isMobile: boolean;
  isAndroid: boolean;
  isTauri: boolean;
  viewportWidth: number;
}

/**
 * Authoritative platform and responsive viewport detection hook.
 * Reactively detects Android OS, mobile viewports (<= 768px), and touch interfaces.
 */
export function useDeviceContext(): DeviceContextValue {
  const [deviceState, setDeviceState] = useState<DeviceContextValue>(() => {
    if (typeof window === "undefined") {
      return {
        isMobile: false,
        isAndroid: false,
        isTauri: false,
        viewportWidth: 1200,
      };
    }
    const width = window.innerWidth;
    const ua = navigator.userAgent;
    const hasTouch = "ontouchstart" in window || navigator.maxTouchPoints > 0;
    const isAndroid = isAndroidDevice(ua);
    const isMobile = isMobileDevice(ua, width, hasTouch);

    return {
      isMobile,
      isAndroid,
      isTauri: isTauri(),
      viewportWidth: width,
    };
  });

  useEffect(() => {
    if (typeof window === "undefined") return;

    const evaluateDevice = () => {
      const width = window.innerWidth;
      const ua = navigator.userAgent;
      const hasTouch = "ontouchstart" in window || navigator.maxTouchPoints > 0;
      const isAndroid = isAndroidDevice(ua);
      const isMobile = isMobileDevice(ua, width, hasTouch);

      setDeviceState({
        isMobile,
        isAndroid,
        isTauri: isTauri(),
        viewportWidth: width,
      });
    };

    window.addEventListener("resize", evaluateDevice);
    window.addEventListener("orientationchange", evaluateDevice);

    return () => {
      window.removeEventListener("resize", evaluateDevice);
      window.removeEventListener("orientationchange", evaluateDevice);
    };
  }, []);

  return deviceState;
}
