import { useRef, useState } from 'react';
import { ImagePlus, Store, Trash2 } from 'lucide-react';

import { useMe, useUpdateMe } from '@/app/session';
import { FormAlert } from '@/components/field';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { apiDelete, apiUpload } from '@/lib/api';
import { compressImage, IMAGE_ACCEPT, MAX_EDGE } from '@/lib/image';

import { PhotoEditor } from '../products/photo/PhotoEditor';

type Kind = 'logo' | 'cover';

const SHAPE: Record<Kind, { aspect: number; hint: string; title: string }> = {
  logo: { aspect: 1, title: 'Adjust your logo', hint: 'Center your logo in the square.' },
  cover: {
    aspect: 16 / 5,
    title: 'Adjust your cover photo',
    hint: 'Keep the important part in the middle: phones show a narrower slice.',
  },
};

/**
 * Cover photo and logo (Section 6.4): pick a file, crop it (16:5 cover, square logo),
 * compress it in the browser, upload. The overlay slider darkens the cover so the
 * shop name on it stays readable.
 */
export function ShopImages({
  overlay,
  onOverlay,
}: {
  overlay: number;
  onOverlay: (value: number) => void;
}) {
  const { shop } = useMe();
  const updateMe = useUpdateMe();
  const input = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<Kind>('cover');
  const [editing, setEditing] = useState<Blob | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function choose(k: Kind) {
    setKind(k);
    setError(null);
    input.current?.click();
  }

  async function upload(cropped: Blob) {
    setEditing(null);
    setBusy(true);
    try {
      const blob = await compressImage(cropped, kind === 'logo' ? MAX_EDGE.logo : MAX_EDGE.cover);
      const { url } = await apiUpload<{ url: string }>(`/uploads/${kind}`, blob);
      updateMe((me) => ({
        ...me,
        shop: { ...me.shop, [kind === 'logo' ? 'logoUrl' : 'coverUrl']: url },
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setBusy(false);
    }
  }

  async function remove(k: Kind) {
    setBusy(true);
    setError(null);
    try {
      await apiDelete(`/shop/${k}`);
      updateMe((me) => ({
        ...me,
        shop: { ...me.shop, [k === 'logo' ? 'logoUrl' : 'coverUrl']: null },
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove it.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-4 rounded-xl border bg-card p-4">
      <h2 className="font-semibold">Logo and cover photo</h2>

      {/* What the top of the shop page and dashboard will look like. */}
      <div className="relative">
        <div className="relative aspect-[16/5] overflow-hidden rounded-lg bg-primary">
          {shop.coverUrl ? (
            <img src={shop.coverUrl} alt="" className="absolute inset-0 size-full object-cover" />
          ) : null}
          <div
            className="absolute inset-0 bg-black"
            style={{ opacity: shop.coverUrl ? overlay : 0 }}
          />
          <div className="absolute right-3 bottom-2 left-24 truncate text-lg font-semibold text-white sm:left-28">
            {shop.name}
          </div>
        </div>
        <div className="absolute -bottom-6 left-3 flex size-16 items-center justify-center overflow-hidden rounded-full border-4 border-card bg-muted sm:size-20">
          {shop.logoUrl ? (
            <img src={shop.logoUrl} alt="Shop logo" className="size-full object-cover" />
          ) : (
            <Store className="size-6 text-muted-foreground" aria-hidden="true" />
          )}
        </div>
      </div>

      <div className="grid gap-2 pt-6 sm:grid-cols-2">
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            className="flex-1"
            disabled={busy}
            onClick={() => {
              choose('logo');
            }}
          >
            <ImagePlus aria-hidden="true" />
            {shop.logoUrl ? 'Change logo' : 'Add logo'}
          </Button>
          {shop.logoUrl ? (
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-9"
              disabled={busy}
              aria-label="Remove logo"
              onClick={() => void remove('logo')}
            >
              <Trash2 aria-hidden="true" />
            </Button>
          ) : null}
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            className="flex-1"
            disabled={busy}
            onClick={() => {
              choose('cover');
            }}
          >
            <ImagePlus aria-hidden="true" />
            {shop.coverUrl ? 'Change cover' : 'Add cover photo'}
          </Button>
          {shop.coverUrl ? (
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-9"
              disabled={busy}
              aria-label="Remove cover photo"
              onClick={() => void remove('cover')}
            >
              <Trash2 aria-hidden="true" />
            </Button>
          ) : null}
        </div>
      </div>

      {shop.coverUrl ? (
        <label className="flex items-center gap-3 text-sm">
          <span className="shrink-0">Darken cover</span>
          <input
            type="range"
            min={0}
            max={0.8}
            step={0.05}
            value={overlay}
            onChange={(e) => {
              onOverlay(Number(e.target.value));
            }}
            className="h-11 flex-1 accent-primary"
          />
        </label>
      ) : null}

      {busy ? (
        <p role="status" className="text-sm text-muted-foreground">
          Uploading…
        </p>
      ) : null}
      {error ? <FormAlert>{error}</FormAlert> : null}

      <input
        ref={input}
        type="file"
        accept={IMAGE_ACCEPT}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) setEditing(file);
        }}
      />
      <Dialog
        open={editing !== null}
        onOpenChange={(o) => {
          if (!o) setEditing(null);
        }}
        title={SHAPE[kind].title}
      >
        {editing ? (
          <PhotoEditor
            source={editing}
            aspect={SHAPE[kind].aspect}
            hint={SHAPE[kind].hint}
            onDone={(blob) => void upload(blob)}
            onCancel={() => {
              setEditing(null);
            }}
          />
        ) : null}
      </Dialog>
    </section>
  );
}
