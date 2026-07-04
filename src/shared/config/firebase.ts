export * from "../services/localDb";

// Stubs for Firebase exports to prevent breakages in import/init paths
export const app = { name: "local-app" };
export const storage = { type: "local-storage-stub" };
export const initAnalytics = async () => null;
