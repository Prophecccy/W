import React, { useState, useEffect, useRef } from "react";
import { useAuthContext } from "../../../auth/context";
import { getUserDoc } from "../../../auth/services/userService";
import { uploadWallpaper, removeWallpaper } from "../../services/wallpaperService";
import { Wallpapers } from "../../../../shared/types";
import { useToast } from "../../../../shared/components/Toast/Toast";
import { Image as ImageIcon, Upload, Trash2 } from "lucide-react";
import "./WallpaperPicker.css";

const SLOTS: Array<{ key: keyof Wallpapers; label: string }> = [
  { key: "desktop", label: "DESKTOP" },
  { key: "widget", label: "WIDGET" },
  { key: "mobile", label: "MOBILE" },
];

export function WallpaperPicker() {
  const { user } = useAuthContext();
  const { showToast } = useToast();
  
  const [wallpapers, setWallpapers] = useState<Wallpapers>({
    desktop: null,
    widget: null,
    mobile: null,
  });
  
  const [loadingObj, setLoadingObj] = useState<Record<string, boolean>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeSlot, setActiveSlot] = useState<keyof Wallpapers | null>(null);

  useEffect(() => {
    if (user) {
      getUserDoc(user.uid).then((doc: any) => {
        if (doc && doc.wallpapers) {
          setWallpapers(doc.wallpapers);
        }
      });
    }
  }, [user]);

  const handleUploadClick = (slot: keyof Wallpapers) => {
    setActiveSlot(slot);
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeSlot || !user) return;
    
    // Reset input
    e.target.value = '';

    setLoadingObj((p) => ({ ...p, [activeSlot]: true }));
    showToast("[ UPLOADING WALLPAPER ]");

    try {
      const url = await uploadWallpaper(activeSlot, file);
      setWallpapers((prev: Wallpapers) => ({ ...prev, [activeSlot]: url }));
      showToast("[ WALLPAPER UPLOADED ]");
    } catch (err: any) {
      showToast(`[ UPLOAD FAILED: ${err.message?.toUpperCase() || "ERROR"} ]`);
    } finally {
      setLoadingObj((p) => ({ ...p, [activeSlot]: false }));
      setActiveSlot(null);
    }
  };

  const handleRemove = async (slot: keyof Wallpapers) => {
    if (!user) return;
    
    setLoadingObj((p) => ({ ...p, [slot]: true }));
    try {
      await removeWallpaper(slot);
      setWallpapers((prev: Wallpapers) => ({ ...prev, [slot]: null }));
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
                  <span className="t-meta">UPLOADING...</span>
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
    </div>
  );
}
