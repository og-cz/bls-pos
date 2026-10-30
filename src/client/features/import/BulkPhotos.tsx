import { useMemo, useRef, useState } from 'react';
import { CheckCircle2, ImageUp } from 'lucide-react';

import { FormAlert } from '@/components/field';
import { Button } from '@/components/ui/button';
import { ApiClientError, apiUpload } from '@/lib/api';
import { prepareProductPhoto } from '@/lib/image';
import { cn } from '@/lib/utils';
import { matchPhotosToSkus } from '@shared/import';

import { PHOTO_ASPECT } from '../products/photo/aspect';
import { useCatalog } from '../products/use-catalog';

// Two photos at a time: fast on a normal connection, gentle on phones.
const PARALLEL = 2;
const RETRIES = 3;

const wait = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

type Status = 'waiting' | 'working' | 'done' | 'failed';

async function uploadOne(file: File, productId: string) {
  const { full, thumb } = await prepareProductPhoto(file, { cropAspect: PHOTO_ASPECT });
  for (let attempt = 0; ; attempt++) {
    try {
      await apiUpload(`/uploads/product?productId=${productId}`, full);
      await apiUpload(`/uploads/product-thumb?productId=${productId}`, thumb);
      return;
    } catch (err) {
      const retryable =
        err instanceof ApiClientError && (err.code === 'NETWORK' || err.status >= 500);
      if (!retryable || attempt >= RETRIES) throw err;
      await wait(1000 * 2 ** attempt);
    }
  }
}

/**
 * Bulk photo upload (Phase 3.5): drop many photos named by SKU ("NGK-CR7.jpg"); each is
 * matched to its product, centre-cropped to the usual 4:3, compressed on the device and
 * uploaded in the background with retries. Existing photos are replaced.
 */
export function BulkPhotos() {
  const catalog = useCatalog();
  const [files, setFiles] = useState<File[]>([]);
  const [status, setStatus] = useState<Record<string, Status>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [running, setRunning] = useState(false);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const match = useMemo(
    () => matchPhotosToSkus(files, catalog.products),
    [files, catalog.products],
  );
  const withPhoto = new Set(catalog.products.filter((p) => p.imageUrl).map((p) => p.id));
  const replacing = match.matched.filter((m) => m.productId && withPhoto.has(m.productId)).length;
  const done = match.matched.filter((m) => status[m.file.name] === 'done').length;
  const failed = match.matched.filter((m) => status[m.file.name] === 'failed').length;

  function add(list: FileList | null) {
    if (!list) return;
    const images = [...list].filter((f) => /^image\/(jpeg|png|webp)$/.test(f.type));
    setFiles((prev) => [...prev, ...images.filter((f) => !prev.some((p) => p.name === f.name))]);
  }

  async function run() {
    setRunning(true);
    const queue = match.matched.filter((m) => status[m.file.name] !== 'done');
    const next = async (): Promise<void> => {
      const item = queue.shift();
      if (!item?.productId) return;
      setStatus((s) => ({ ...s, [item.file.name]: 'working' }));
      try {
        await uploadOne(item.file, item.productId);
        setStatus((s) => ({ ...s, [item.file.name]: 'done' }));
      } catch (err) {
        setStatus((s) => ({ ...s, [item.file.name]: 'failed' }));
        setErrors((e) => ({
          ...e,
          [item.file.name]: err instanceof Error ? err.message : 'Upload failed.',
        }));
        // Out of image space: stop instead of failing every remaining photo.
        if (err instanceof ApiClientError && err.code === 'STORAGE_LIMIT_REACHED') {
          queue.length = 0;
        }
      }
      return next();
    };
    await Promise.all(Array.from({ length: PARALLEL }, next));
    setRunning(false);
    catalog.reload();
  }

  return (
    <div className="space-y-4">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => {
          setDragging(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          add(e.dataTransfer.files);
        }}
        className={cn(
          'flex flex-col items-center gap-2 rounded-xl border-2 border-dashed p-6 text-center',
          dragging ? 'border-primary bg-primary/5' : 'border-input',
        )}
      >
        <ImageUp className="size-8 text-muted-foreground" aria-hidden="true" />
        <p className="text-sm">
          Drop photos here, named by SKU, like <span className="font-mono">NGK-CR7.jpg</span>
        </p>
        <Button
          type="button"
          variant="outline"
          disabled={running}
          onClick={() => inputRef.current?.click()}
        >
          Choose photos
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          className="sr-only"
          tabIndex={-1}
          onChange={(e) => {
            add(e.target.files);
            e.target.value = '';
          }}
        />
      </div>

      {files.length ? (
        <div className="space-y-3 text-sm" aria-live="polite">
          <p>
            <strong>{match.matched.length}</strong> matched to products
            {replacing ? ` (${replacing} will replace an existing photo)` : ''}
            {match.unmatched.length ? ` · ${match.unmatched.length} with no matching SKU` : ''}
            {match.duplicates.length ? ` · ${match.duplicates.length} duplicates ignored` : ''}
          </p>
          {match.unmatched.length ? (
            <p className="text-muted-foreground">
              No product with SKU:{' '}
              {match.unmatched
                .slice(0, 15)
                .map((m) => m.sku)
                .join(', ')}
              {match.unmatched.length > 15 ? '…' : ''}
            </p>
          ) : null}

          {running || done || failed ? (
            <div className="space-y-1">
              <div
                role="progressbar"
                aria-label="Photo upload progress"
                aria-valuemin={0}
                aria-valuemax={match.matched.length}
                aria-valuenow={done + failed}
                className="h-3 overflow-hidden rounded-full bg-muted"
              >
                <div
                  className="h-full rounded-full bg-primary transition-[width]"
                  style={{
                    width: `${match.matched.length ? ((done + failed) / match.matched.length) * 100 : 0}%`,
                  }}
                />
              </div>
              <p className="text-muted-foreground tabular">
                {done} of {match.matched.length} uploaded{failed ? ` · ${failed} failed` : ''}
              </p>
            </div>
          ) : null}

          {Object.keys(errors).length ? (
            <FormAlert>
              {Object.entries(errors)
                .slice(0, 5)
                .map(([name, message]) => `${name}: ${message}`)
                .join(' · ')}
            </FormAlert>
          ) : null}

          {!running && done === match.matched.length && done > 0 ? (
            <p className="flex items-center gap-2 font-medium">
              <CheckCircle2 className="size-5 text-emerald-600" aria-hidden="true" />
              All matched photos are uploaded.
            </p>
          ) : (
            <div className="flex gap-2">
              <Button disabled={running || match.matched.length === 0} onClick={() => void run()}>
                {running
                  ? 'Uploading…'
                  : failed
                    ? `Retry ${failed} failed`
                    : `Upload ${match.matched.length} photos`}
              </Button>
              <Button
                variant="ghost"
                disabled={running}
                onClick={() => {
                  setFiles([]);
                  setStatus({});
                  setErrors({});
                }}
              >
                Clear
              </Button>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
