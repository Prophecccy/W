import React, { useState, useEffect, useRef } from "react";
import { uploadWallpaper, removeWallpaper } from "../../services/wallpaperService";
import { getAllLocalWallpapers } from "../../../../shared/utils/storageUtils";
import { Wallpapers } from "../../../../shared/types";
import { useToast } from "../../../../shared/components/Toast/Toast";
import { Image as ImageIcon, Upload, Trash2, Contrast, Droplet } from "lucide-react";
import { useAuthContext } from "../../../auth/context";
import { getUserDoc, updateUserDoc } from "../../../auth/services/userService";
import "./WallpaperPicker.css";

const SLOTS: Array<{ key: keyof Wallpapers; label: string }> = [
  { key: "desktop", label: "DESKTOP" },
  { key: "widget", label: "WIDGET" },
  { key: "mobile", label: "MOBILE" },
];

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
  
  const { user } = useAuthContext();
  const [dim, setDim] = useState(0.2);
  const [blur, setBlur] = useState(0);

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
          setDim(doc.aesthetics?.desktop?.dimIntensity ?? 0.2);
          setBlur(doc.aesthetics?.desktop?.blurIntensity ?? 0);
        }
      });
    }
  }, [user]);

  const handleDimChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseFloat(e.target.value);
    setDim(v);
    document.documentElement.style.setProperty("--app-wallpaper-dim", v.toString());
    if (user) await updateUserDoc(user.uid, { "aesthetics.desktop.dimIntensity": v } as any);
  };

  const handleBlurChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseFloat(e.target.value);
    setBlur(v);
    document.documentElement.style.setProperty("--app-wallpaper-blur", `${v}px`);
    if (user) await updateUserDoc(user.uid, { "aesthetics.desktop.blurIntensity": v } as any);
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
    
    // Reset input
    e.target.value = '';

    const slotKey = activeSlot;
    setLoadingObj((p) => ({ ...p, [slotKey]: true }));

    try {
      const url = await uploadWallpaper(slotKey, file);
      setWallpapers((prev: Wallpapers) => ({ ...prev, [slotKey]: url }));
      // Tell parent windows (like WidgetApp or Dashboard) about the change via an event
      window.dispatchEvent(new Event('wallpaper-changed'));
      
      showToast("[ WALLPAPER SAVED ]");
    } catch (err: any) {
      showToast(`[ SAVE FAILED: ${err.message?.toUpperCase() || "ERROR"} ]`);
    } finally {
      setLoadingObj((p) => ({ ...p, [slotKey]: false }));
      setActiveSlot(null);
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
      <input
        type="file"
        accept="image/png, image/jpeg, image/webp"
        ref={fileInputRef}
        onChange={handleFileChange}
        className="wallpaper-file-input"
      />
      
      <div className="wallpaper-slots">
        {SLOTS.map((slot) => {
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
        <div className="wallpaper-control">
          <div className="wallpaper-control__label">
            <Contrast size={14} />
            <span className="t-body">Dim Intensity</span>
            <span className="t-meta wallpaper-control__val">{Math.round(dim * 100)}%</span>
          </div>
          <input 
            type="range" 
            min="0" max="1" step="0.05"
            value={dim}
            onChange={handleDimChange}
            className="w-range"
          />
        </div>
        <div className="wallpaper-control">
          <div className="wallpaper-control__label">
            <Droplet size={14} />
            <span className="t-body">Blur Intensity</span>
            <span className="t-meta wallpaper-control__val">{blur}px</span>
          </div>
          <input 
            type="range" 
            min="0" max="20" step="1"
            value={blur}
            onChange={handleBlurChange}
            className="w-range"
          />
        </div>
      </div>
    </div>
  );
}
