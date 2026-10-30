import { useState } from 'react';
import { Dialog as DialogPrimitive, VisuallyHidden } from 'radix-ui';
import { ImageOff, X } from 'lucide-react';

import { cn } from '@/lib/utils';

type Photo = { name: string; imageUrl: string | null; thumbUrl: string | null };

/**
 * A product's photo, small. Tapping it opens the full photo, so similar-looking parts can
 * be told apart at a glance. Lists load only the thumbnail.
 */
export function ProductPhoto({
  product,
  onOpen,
  className,
}: {
  product: Photo;
  onOpen: (product: Photo) => void;
  className?: string;
}) {
  // Photos added before thumbnails existed have none: fall back to the full photo.
  const [failedThumb, setFailedThumb] = useState<string | null>(null);
  const src =
    product.thumbUrl && product.thumbUrl !== failedThumb ? product.thumbUrl : product.imageUrl;

  if (!product.imageUrl || !src) {
    return (
      <span
        className={cn(
          'flex size-14 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground',
          className,
        )}
        aria-hidden="true"
      >
        <ImageOff className="size-5" />
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={() => {
        onOpen(product);
      }}
      aria-label={`View photo of ${product.name}`}
      className={cn(
        'size-14 shrink-0 overflow-hidden rounded-lg bg-muted outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
        className,
      )}
    >
      <img
        src={src}
        alt=""
        loading="lazy"
        decoding="async"
        className="size-full object-cover"
        onError={() => {
          if (src === product.thumbUrl) setFailedThumb(product.thumbUrl);
        }}
      />
    </button>
  );
}

/** Full-screen photo. Pinch to zoom on phones; tap the background, ✕ or Escape to close. */
export function PhotoViewer({ photo, onClose }: { photo: Photo | null; onClose: () => void }) {
  return (
    <DialogPrimitive.Root
      open={photo !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/90" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center p-4 outline-none"
          onClick={onClose}
        >
          <VisuallyHidden.Root asChild>
            <DialogPrimitive.Title>{photo?.name ?? 'Photo'}</DialogPrimitive.Title>
          </VisuallyHidden.Root>
          {photo?.imageUrl ? (
            <img
              src={photo.imageUrl}
              alt={photo.name}
              className="max-h-[calc(100dvh-6rem)] max-w-full touch-pinch-zoom rounded-lg object-contain"
              onClick={(e) => {
                e.stopPropagation();
              }}
            />
          ) : null}
          <p className="mt-3 text-center text-sm font-medium text-white">{photo?.name}</p>
          <DialogPrimitive.Close
            className="absolute top-4 right-4 flex size-11 items-center justify-center rounded-full bg-white/10 text-white outline-none hover:bg-white/20 focus-visible:ring-[3px] focus-visible:ring-white/60"
            aria-label="Close photo"
          >
            <X className="size-6" />
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
