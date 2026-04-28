import React, { useState, useRef, useEffect } from 'react';
import './WallpaperCropEditor.css';

export interface CropResult {
  blob: Blob;
  cropX: number; // 0-100 percentage
  cropY: number; // 0-100 percentage
}

interface WallpaperCropEditorProps {
  imageFile: File;
  onConfirm: (result: CropResult) => void;
  onCancel: () => void;
}

type SizeId = 'small' | 'medium' | 'large';

const SIZE_TABS: { id: SizeId; label: string; tasks: number; logicalH: number }[] = [
  { id: 'small',  label: 'SMALL',  tasks: 2, logicalH: 280 },
  { id: 'medium', label: 'MEDIUM', tasks: 4, logicalH: 428 },
  { id: 'large',  label: 'LARGE',  tasks: 7, logicalH: 650 },
];

const WIDGET_W = 420; // logical widget width in px
const PREVIEW_W = 220; // width of editor preview in px

export function WallpaperCropEditor({ imageFile, onConfirm, onCancel }: WallpaperCropEditorProps) {
  const [activeTab, setActiveTab] = useState<SizeId>('medium');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [cropX, setCropX] = useState(50);
  const [cropY, setCropY] = useState(50);

  const isDragging = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });
  const previewRef = useRef<HTMLDivElement>(null);

  // Load file as object URL
  useEffect(() => {
    const url = URL.createObjectURL(imageFile);
    setImageUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  const currentSize = SIZE_TABS.find(t => t.id === activeTab)!;
  const previewH = Math.round(PREVIEW_W * currentSize.logicalH / WIDGET_W);

  // ─── Drag to reposition ───────────────────────────────────
  const onPointerDown = (e: React.PointerEvent) => {
    isDragging.current = true;
    lastPos.current = { x: e.clientX, y: e.clientY };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!isDragging.current || !previewRef.current) return;
    const dx = e.clientX - lastPos.current.x;
    const dy = e.clientY - lastPos.current.y;
    lastPos.current = { x: e.clientX, y: e.clientY };

    const rect = previewRef.current.getBoundingClientRect();
    // Dragging right = image moves right = focal point shifts left
    const pctDx = (dx / rect.width) * 100;
    const pctDy = (dy / rect.height) * 100;

    setCropX(prev => Math.max(0, Math.min(100, prev - pctDx)));
    setCropY(prev => Math.max(0, Math.min(100, prev - pctDy)));
  };

  const onPointerUp = () => { isDragging.current = false; };

  // ─── Confirm ─────────────────────────────────────────────
  const handleConfirm = () => {
    onConfirm({ blob: imageFile, cropX, cropY });
  };

  if (!imageUrl) return null;

  return (
    <div className="crop-editor-backdrop" onClick={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="crop-editor">
        {/* Header */}
        <div className="crop-editor__header">
          <span className="crop-editor__title">POSITION WALLPAPER</span>
          <span className="crop-editor__hint">DRAG TO REPOSITION</span>
        </div>

        {/* Draggable preview */}
        <div
          ref={previewRef}
          className="crop-editor__preview"
          style={{ width: PREVIEW_W, height: previewH }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {/* Photo layer */}
          <div
            className="crop-editor__photo"
            style={{
              backgroundImage: `url(${imageUrl})`,
              backgroundPosition: `${cropX}% ${cropY}%`,
            }}
          />
          {/* Dim overlay */}
          <div className="crop-editor__dim" />
          {/* Widget content skeleton */}
          <div className="crop-editor__skeleton">
            <div className="crop-editor__sk-header">
              <div className="crop-editor__sk-clock" />
              <div className="crop-editor__sk-ring" />
            </div>
            <div className="crop-editor__sk-cards">
              {Array.from({ length: currentSize.tasks }).map((_, i) => (
                <div key={i} className="crop-editor__sk-card" />
              ))}
            </div>
          </div>
          {/* Corner crosshair */}
          <div className="crop-editor__crosshair">
            <span className="crop-editor__pct">{Math.round(cropX)}% {Math.round(cropY)}%</span>
          </div>
        </div>

        {/* Size tabs */}
        <div className="crop-editor__tabs">
          {SIZE_TABS.map(tab => (
            <button
              key={tab.id}
              className={`crop-editor__tab ${activeTab === tab.id ? 'crop-editor__tab--active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
              <span className="crop-editor__tab-count">{tab.tasks} tasks</span>
            </button>
          ))}
        </div>

        {/* Actions */}
        <div className="crop-editor__actions">
          <button className="crop-editor__btn crop-editor__btn--cancel" onClick={onCancel}>
            CANCEL
          </button>
          <button className="crop-editor__btn crop-editor__btn--confirm" onClick={handleConfirm}>
            CONFIRM
          </button>
        </div>
      </div>
    </div>
  );
}
