import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent } from 'react';
import { RotateCw, Undo2, ZoomIn, ZoomOut } from 'lucide-react';

import { Button } from '@/components/ui/button';

import { PHOTO_ASPECT } from './aspect';
import { GuideFrame } from './GuideFrame';

const MAX_ZOOM = 4;
const OUTPUT_WIDTH = 1600;

type Props = {
  source: Blob;
  onDone: (photo: Blob) => void;
  onCancel: () => void;
  /** Width:height of the result. Product photos are 4:3; logos 1:1, covers 16:5. */
  aspect?: number;
  /** What to tell the person; product photos get the shelf hint and centering guide. */
  hint?: string;
};

type View = { zoom: number; rotation: 0 | 90 | 180 | 270; x: number; y: number };
const START: View = { zoom: 1, rotation: 0, x: 0, y: 0 };

/**
 * Crop and adjust a photo before it's used: drag to move, zoom, rotate. Product photos
 * are 4:3 with a guide showing where the product should sit; logos and covers pass their
 * own shape.
 */
export function PhotoEditor({ source, onDone, onCancel, aspect = PHOTO_ASPECT, hint }: Props) {
  const frameRef = useRef<HTMLDivElement>(null);
  // The loaded photo and its temporary address; set together once it has loaded.
  const [loaded, setLoaded] = useState<{ img: HTMLImageElement; url: string } | null>(null);
  const img = loaded?.img ?? null;
  const [frameWidth, setFrameWidth] = useState(0);
  const [view, setView] = useState<View>(START);
  const [busy, setBusy] = useState(false);
  const drag = useRef<{ id: number; x: number; y: number } | null>(null);

  useEffect(() => {
    // Created here (not during render) so each run owns, and later releases, its own URL.
    const url = URL.createObjectURL(source);
    let cancelled = false;
    const image = new Image();
    image.onload = () => {
      if (!cancelled) setLoaded({ img: image, url });
    };
    image.src = url;
    return () => {
      cancelled = true;
      URL.revokeObjectURL(url);
    };
  }, [source]);

  useLayoutEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setFrameWidth(el.clientWidth);
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
    };
  }, []);

  const frameHeight = frameWidth / aspect;
  const sideways = view.rotation === 90 || view.rotation === 270;
  const natW = img?.naturalWidth ?? 1;
  const natH = img?.naturalHeight ?? 1;
  const rotW = sideways ? natH : natW;
  const rotH = sideways ? natW : natH;
  // At zoom 1 the photo just covers the frame; zooming goes in from there.
  const cover = frameWidth ? Math.max(frameWidth / rotW, frameHeight / rotH) : 0;
  const scale = cover * view.zoom;

  /** Keeps the photo covering the whole frame (no empty edges). */
  function clamp(v: View): View {
    const s = cover * v.zoom;
    const maxX = Math.max(0, (rotW * s - frameWidth) / 2);
    const maxY = Math.max(0, (rotH * s - frameHeight) / 2);
    return {
      ...v,
      x: Math.min(maxX, Math.max(-maxX, v.x)),
      y: Math.min(maxY, Math.max(-maxY, v.y)),
    };
  }

  function update(patch: Partial<View>) {
    setView((v) => clamp({ ...v, ...patch }));
  }

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    try {
      // Keeps the drag going if the finger slides outside the frame.
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Not available for this pointer; dragging still works inside the frame.
    }
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
  }
  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (d?.id !== e.pointerId) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
    setView((v) => clamp({ ...v, x: v.x + dx, y: v.y + dy }));
  }
  function onPointerUp() {
    drag.current = null;
  }

  async function done() {
    if (!img || !frameWidth) return;
    setBusy(true);
    try {
      // Never enlarge past the photo's own detail: output at most what the frame shows.
      const outW = Math.round(Math.min(OUTPUT_WIDTH, frameWidth / scale));
      const outH = Math.round(outW / aspect);
      const k = outW / frameWidth;
      const canvas = document.createElement('canvas');
      canvas.width = outW;
      canvas.height = outH;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('This browser cannot edit photos.');
      ctx.imageSmoothingQuality = 'high';
      ctx.translate(outW / 2 + view.x * k, outH / 2 + view.y * k);
      ctx.rotate((view.rotation * Math.PI) / 180);
      ctx.scale(scale * k, scale * k);
      ctx.drawImage(img, -natW / 2, -natH / 2);
      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(resolve, 'image/jpeg', 0.92);
      });
      if (blob) onDone(blob);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div
        ref={frameRef}
        className="relative w-full cursor-grab touch-none overflow-hidden rounded-xl bg-black select-none active:cursor-grabbing"
        style={{ aspectRatio: String(aspect) }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={(e) => {
          update({
            zoom: Math.min(MAX_ZOOM, Math.max(1, view.zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1))),
          });
        }}
        role="img"
        aria-label="Photo being adjusted. Drag to move it."
      >
        {loaded ? (
          <img
            src={loaded.url}
            alt=""
            draggable={false}
            className="absolute top-1/2 left-1/2 max-w-none"
            style={{
              width: natW,
              height: natH,
              transform: `translate(-50%, -50%) translate(${view.x}px, ${view.y}px) rotate(${view.rotation}deg) scale(${scale})`,
            }}
          />
        ) : null}
        {hint ? null : <GuideFrame />}
      </div>
      <p className="text-sm text-muted-foreground">
        {hint ??
          "Put the product in the box. Keep some of the shelf or bin around it, so staff can see where it's kept."}
      </p>

      <div className="flex items-center gap-3">
        <ZoomOut className="size-5 text-muted-foreground" aria-hidden="true" />
        <input
          type="range"
          min={1}
          max={MAX_ZOOM}
          step={0.01}
          value={view.zoom}
          onChange={(e) => {
            update({ zoom: Number(e.target.value) });
          }}
          aria-label="Zoom"
          className="h-11 flex-1 accent-primary"
        />
        <ZoomIn className="size-5 text-muted-foreground" aria-hidden="true" />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            update({ rotation: ((view.rotation + 90) % 360) as View['rotation'], x: 0, y: 0 });
          }}
        >
          <RotateCw aria-hidden="true" />
          Rotate
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setView(START);
          }}
        >
          <Undo2 aria-hidden="true" />
          Reset
        </Button>
        <div className="ml-auto flex gap-2">
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="button" disabled={!img || busy} onClick={() => void done()}>
            {busy ? 'Saving…' : 'Done'}
          </Button>
        </div>
      </div>
    </div>
  );
}
