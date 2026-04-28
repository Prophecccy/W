import React, { useState, useEffect, useRef } from "react";
import { uploadWallpaper, removeWallpaper } from "../../services/wallpaperService";
import { getAllLocalWallpapers, setLocalWallpaper } from "../../../../shared/utils/storageUtils";
import { Wallpapers } from "../../../../shared/types";
import { useToast } from "../../../../shared/components/Toast/Toast";
import { Image as ImageIcon, Upload, Trash2, Contrast, Droplet } from "lucide-react";
import { useAuthContext } from "../../../auth/context";
import { getUserDoc, updateUserDoc } from "../../../auth/services/userService";
import { isTauri, isMobileWeb } from "../../../../shared/utils/tauri";
import { WallpaperCropEditor, CropResult } from "../WallpaperCropEditor/WallpaperCropEditor";
import "./WallpaperPicker.css";

const ALL_SLOTS: Array<{ key: keyof Wallpapers; label: string }> = [
  { key: "desktop", label: "DESKTOP" },
  { key: "widget", label: "WIDGET" },
  { key: "mobile", label: "MOBILE" },
];

/**
 * Environment-aware slot filtering:
 * - Desktop Web  → [DESKTOP] only  (stored in browser cache)
 * - Mobile Web   → [MOBILE] only   (stored in browser cache)
 * - Tauri Native → [DESKTOP] + [WIDGET] (stored locally on device)
 */
function getVisibleSlots() {
  if (isTauri()) {
    return ALL_SLOTS.filter(s => s.key === "desktop" || s.key === "widget");
  }
  if (isMobileWeb()) {
    return ALL_SLOTS.filter(s => s.key === "mobile");
  }
  // Desktop web
  return ALL_SLOTS.filter(s => s.key === "desktop");
}

export function WallpaperPicker() {
  const { showToast } = useToast();
  
  const [wallpapers, setWallpapers] = useState<Wallpapers>({
    desktop: null,
    widget: null,
    mobile: null,
  });

  const [loadingObj, setLoadingObj] = useState<Record<string, boolean>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeSlot, setActiveSlot] = useState<keyof Wallpapers | null>(null);
  // Widget crop editor
  const [cropFile, setCropFile] = useState<File | null>(null);
  
  const { user } = useAuthContext();
  const [dimDesktop, setDimDesktop] = useState(0.2);
  const [blurDesktop, setBlurDesktop] = useState(0);
  const [dimWidget, setDimWidget] = useState(0.7);
  const [blurWidget, setBlurWidget] = useState(0);

  useEffect(() => {
    // Fetch directly from IndexedDB on mount
    getAllLocalWallpapers().then((localWallpapers) => {
      setWallpapers(localWallpapers);
    }).catch(err => {
      console.error("Failed to load local wallpapers", err);
    });

    if (user) {
      getUserDoc(user.uid).then(doc => {
        if (doc) {
          setDimDesktop(doc.aesthetics?.desktop?.dimIntensity ?? 0.2);
          setBlurDesktop(doc.aesthetics?.desktop?.blurIntensity ?? 0);
          setDimWidget(doc.aesthetics?.widget?.dimIntensity ?? 0.7);
          setBlurWidget(doc.aesthetics?.widget?.blurIntensity ?? 0);
        }
      });
    }
  }, [user]);

  const handleDimChange = async (slot: 'desktop' | 'widget', e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseFloat(e.target.value);
    if (slot === 'desktop') {
      setDimDesktop(v);
      document.documentElement.style.setProperty("--app-wallpaper-dim", v.toString());
      if (user) await updateUserDoc(user.uid, { "aesthetics.desktop.dimIntensity": v } as any);
    } else {
      setDimWidget(v);
      if (user) await updateUserDoc(user.uid, { "aesthetics.widget.dimIntensity": v } as any);
    }
  };

  const handleBlurChange = async (slot: 'desktop' | 'widget', e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseFloat(e.target.value);
    if (slot === 'desktop') {
      setBlurDesktop(v);
      document.documentElement.style.setProperty("--app-wallpaper-blur", `${v}px`);
      if (user) await updateUserDoc(user.uid, { "aesthetics.desktop.blurIntensity": v } as any);
    } else {
      setBlurWidget(v);
      if (user) await updateUserDoc(user.uid, { "aesthetics.widget.blurIntensity": v } as any);
    }
  };

  const handleUploadClick = (slot: keyof Wallpapers) => {
    setActiveSlot(slot);
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeSlot) return;
    e.target.value = '';

    // Widget wallpaper → open the crop editor before saving
    if (activeSlot === 'widget') {
      setCropFile(file);
      setActiveSlot(null);
      return;
    }

    // Other slots → upload directly (existing behaviour)
    const slotKey = activeSlot;
    setLoadingObj((p) => ({ ...p, [slotKey]: true }));
    try {
      const url = await uploadWallpaper(slotKey, file);
      setWallpapers((prev: Wallpapers) => ({ ...prev, [slotKey]: url }));
      window.dispatchEvent(new Event('wallpaper-changed'));
      showToast("[ WALLPAPER SAVED ]");
    } catch (err: any) {
      showToast(`[ SAVE FAILED: ${err.message?.toUpperCase() || "ERROR"} ]`);
    } finally {
      setLoadingObj((p) => ({ ...p, [slotKey]: false }));
      setActiveSlot(null);
    }
  };

  // ─── Widget crop confirm ──────────────────────────────────
  const handleCropConfirm = async ({ blob, cropX, cropY }: CropResult) => {
    setCropFile(null);
    setLoadingObj((p) => ({ ...p, widget: true }));
    try {
      const url = await setLocalWallpaper('widget', blob);
      setWallpapers((prev: Wallpapers) => ({ ...prev, widget: url }));
      // Persist crop position to userDoc so the widget reads it live
      if (user) {
        await updateUserDoc(user.uid, {
          'aesthetics.widget.cropX': cropX,
          'aesthetics.widget.cropY': cropY,
        } as any);
      }
      window.dispatchEvent(new Event('wallpaper-changed'));
      showToast("[ WALLPAPER SAVED ]");
    } catch (err: any) {
      showToast(`[ SAVE FAILED: ${err.message?.toUpperCase() || "ERROR"} ]`);
    } finally {
      setLoadingObj((p) => ({ ...p, widget: false }));
    }
  };

  const handleRemove = async (slot: keyof Wallpapers) => {
    setLoadingObj((p) => ({ ...p, [slot]: true }));
    try {
      await removeWallpaper(slot);
      setWallpapers((prev: Wallpapers) => ({ ...prev, [slot]: null }));
      window.dispatchEvent(new Event('wallpaper-changed'));
      showToast("[ WALLPAPER REMOVED ]");
    } catch (err: any) {
      showToast("[ FAILED TO REMOVE ]");
    } finally {
      setLoadingObj((p) => ({ ...p, [slot]: false }));
    }
  };

  return (
    <div className="wallpaper-picker">
      {/* Crop editor modal — only for widget slot */}
      {cropFile && (
        <WallpaperCropEditor
          imageFile={cropFile}
          onConfirm={handleCropConfirm}
          onCancel={() => setCropFile(null)}
        />
      )}

      <input
        type="file"
        accept="image/png, image/jpeg, image/webp"
        ref={fileInputRef}
        onChange={handleFileChange}
        className="wallpaper-file-input"
      />
      
      <div className="wallpaper-slots">
        {getVisibleSlots().map((slot) => {
          const keyStr = slot.key as string;
          const currentUrl = wallpapers[slot.key];
          const isLoading = loadingObj[keyStr];

          return (
            <div key={keyStr} className="wallpaper-slot">
              <span className="wallpaper-slot__label t-meta">[{slot.label}]</span>
              
              <div className="wallpaper-slot__preview">
                {isLoading ? (
                  <span className="t-meta">SAVING...</span>
                ) : currentUrl ? (
                  <img src={currentUrl} alt={`${slot.label} wallpaper`} />
                ) : (
                  <ImageIcon size={20} className="upload-icon" strokeWidth={1} />
                )}
              </div>

              <div className="wallpaper-slot__actions">
                <button
                  className="wallpaper-slot__btn"
                  onClick={() => handleUploadClick(slot.key)}
                  disabled={isLoading}
                  title="Upload New"
                >
                  <Upload size={14} />
                </button>
                <button
                  className="wallpaper-slot__btn danger"
                  onClick={() => handleRemove(slot.key)}
                  disabled={!currentUrl || isLoading}
                  title="Remove Wallpaper"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="wallpaper-picker-controls">
        <div className="wallpaper-picker-controls-group">
          <div className="t-meta" style={{ marginBottom: 12, opacity: 0.6 }}>DESKTOP SETTINGS</div>
          <div className="wallpaper-control">
            <div className="wallpaper-control__label">
              <Contrast size={14} />
              <span className="t-body">Dim Intensity</span>
              <span className="t-meta wallpaper-control__val">{Math.round(dimDesktop * 100)}%</span>
            </div>
            <input 
              type="range" 
              min="0" max="1" step="0.05"
              value={dimDesktop}
              onChange={(e) => handleDimChange('desktop', e)}
              className="w-range"
            />
          </div>
          <div className="wallpaper-control">
            <div className="wallpaper-control__label">
              <Droplet size={14} />
              <span className="t-body">Blur Intensity</span>
              <span className="t-meta wallpaper-control__val">{blurDesktop}px</span>
            </div>
            <input 
              type="range" 
              min="0" max="20" step="1"
              value={blurDesktop}
              onChange={(e) => handleBlurChange('desktop', e)}
              className="w-range"
            />
          </div>
        </div>

        {isTauri() && (
          <div className="wallpaper-picker-controls-group" style={{ marginTop: 16 }}>
            <div className="t-meta" style={{ marginBottom: 12, opacity: 0.6 }}>WIDGET SETTINGS</div>
            <div className="wallpaper-control">
              <div className="wallpaper-control__label">
                <Contrast size={14} />
                <span className="t-body">Dim Intensity</span>
                <span className="t-meta wallpaper-control__val">{Math.round(dimWidget * 100)}%</span>
              </div>
              <input 
                type="range" 
                min="0" max="1" step="0.05"
                value={dimWidget}
                onChange={(e) => handleDimChange('widget', e)}
                className="w-range"
              />
            </div>
            <div className="wallpaper-control">
              <div className="wallpaper-control__label">
                <Droplet size={14} />
                <span className="t-body">Blur Intensity</span>
                <span className="t-meta wallpaper-control__val">{blurWidget}px</span>
              </div>
              <input 
                type="range" 
                min="0" max="20" step="1"
                value={blurWidget}
                onChange={(e) => handleBlurChange('widget', e)}
                className="w-range"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
