import { useEffect, useRef, useState } from 'react';
import { Camera, SwitchCamera } from 'lucide-react';

import { FormAlert } from '@/components/field';
import { Button } from '@/components/ui/button';

import { PHOTO_ASPECT } from './aspect';
import { GuideFrame } from './GuideFrame';

// Some browsers (or pages not served over HTTPS) have no camera access at all.
const cameraSupported =
  typeof navigator !== 'undefined' &&
  typeof (navigator.mediaDevices as MediaDevices | undefined)?.getUserMedia === 'function';

type Props = {
  onCaptured: (photo: Blob) => void;
  onCancel: () => void;
  /** When the camera can't be used here (no permission, no camera), use a file instead. */
  onFallback: (file: File) => void;
};

/**
 * Live camera with the centering guide, so every product photo is framed the same way.
 * The back camera is preferred on phones. The camera turns off when this closes.
 */
export function CameraCapture({ onCaptured, onCancel, onFallback }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [facing, setFacing] = useState<'environment' | 'user'>('environment');
  const [failure, setError] = useState<string | null>(null);
  const error = cameraSupported ? failure : "This browser can't open the camera here.";
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;
    if (!cameraSupported) return;
    navigator.mediaDevices
      .getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: facing },
          width: { ideal: 1920 },
          height: { ideal: 1440 },
        },
      })
      .then((s) => {
        if (cancelled) {
          s.getTracks().forEach((t) => {
            t.stop();
          });
          return;
        }
        stream = s;
        const video = videoRef.current;
        if (video) {
          video.srcObject = s;
          void video.play().then(() => {
            setReady(true);
          });
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const denied = err instanceof DOMException && err.name === 'NotAllowedError';
        setError(
          denied
            ? 'Camera access was blocked. Allow the camera for this site, or use the phone camera instead.'
            : "Couldn't open the camera. Use the phone camera instead.",
        );
      });
    return () => {
      cancelled = true;
      setReady(false);
      stream?.getTracks().forEach((t) => {
        t.stop();
      });
    };
  }, [facing]);

  async function capture() {
    const video = videoRef.current;
    if (!video?.videoWidth) return;
    // Take the same 4:3 area the guide shows, from the middle of the camera picture.
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    const cropW = Math.min(vw, vh * PHOTO_ASPECT);
    const cropH = cropW / PHOTO_ASPECT;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(cropW);
    canvas.height = Math.round(cropH);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, (vw - cropW) / 2, (vh - cropH) / 2, cropW, cropH, 0, 0, cropW, cropH);
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', 0.92);
    });
    if (blob) onCaptured(blob);
  }

  return (
    <div className="space-y-4">
      {error ? (
        <div className="space-y-3">
          <FormAlert>{error}</FormAlert>
          {/* The phone's own camera app; no guide, but the editor's guide comes next. */}
          <label className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-within:ring-[3px] focus-within:ring-ring/50">
            <Camera className="size-4" aria-hidden="true" />
            Use phone camera
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onFallback(file);
              }}
            />
          </label>
        </div>
      ) : (
        <div
          className="relative w-full overflow-hidden rounded-xl bg-black"
          style={{ aspectRatio: String(PHOTO_ASPECT) }}
        >
          <video
            ref={videoRef}
            playsInline
            muted
            className="absolute inset-0 size-full object-cover"
            aria-label="Camera preview"
          />
          <GuideFrame />
          {!ready ? (
            <p className="absolute inset-0 flex items-center justify-center text-sm text-white/80">
              Opening camera…
            </p>
          ) : null}
        </div>
      )}
      {!error ? (
        <p className="text-sm text-muted-foreground">
          Put the product in the box. Keep some of the shelf or bin around it, so staff can see
          where it&apos;s kept.
        </p>
      ) : null}
      <div className="flex items-center gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        {!error ? (
          <>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="ml-auto"
              aria-label="Switch camera"
              onClick={() => {
                setFacing((f) => (f === 'environment' ? 'user' : 'environment'));
              }}
            >
              <SwitchCamera aria-hidden="true" />
            </Button>
            <Button type="button" size="lg" disabled={!ready} onClick={() => void capture()}>
              <Camera aria-hidden="true" />
              Take photo
            </Button>
          </>
        ) : null}
      </div>
    </div>
  );
}
