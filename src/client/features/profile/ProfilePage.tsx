import { useRef, useState } from 'react';
import { Check, ImagePlus, Trash2 } from 'lucide-react';

import { useMe, useUpdateMe } from '@/app/session';
import { Avatar } from '@/components/avatar';
import { PageHeader } from '@/components/empty-state';
import { FormAlert, TextField } from '@/components/field';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { apiDelete, apiPatch, apiUpload } from '@/lib/api';
import { compressImage, IMAGE_ACCEPT, MAX_EDGE } from '@/lib/image';

import { PhotoEditor } from '../products/photo/PhotoEditor';
import { TwoFactorCard } from './TwoFactorCard';

const ROLE_LABEL = { owner: 'Owner', admin: 'Admin', staff: 'Staff' } as const;

/** Your own profile: photo and the name others see on receipts and reports. */
export function ProfilePage() {
  const { user, shop } = useMe();
  const updateMe = useUpdateMe();
  const input = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(user.displayName);
  const [editing, setEditing] = useState<Blob | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function run(task: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await task();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  const uploadPhoto = (cropped: Blob) =>
    run(async () => {
      setEditing(null);
      const blob = await compressImage(cropped, MAX_EDGE.avatar);
      const { url } = await apiUpload<{ url: string }>('/uploads/avatar', blob);
      updateMe((me) => ({ ...me, user: { ...me.user, avatarUrl: url } }));
    });

  const removePhoto = () =>
    run(async () => {
      await apiDelete('/me/avatar');
      updateMe((me) => ({ ...me, user: { ...me.user, avatarUrl: null } }));
    });

  const saveName = () =>
    run(async () => {
      const { displayName } = await apiPatch<{ displayName: string }>('/me', {
        displayName: name.trim(),
      });
      updateMe((me) => ({ ...me, user: { ...me.user, displayName } }));
      setName(displayName);
      setSaved(true);
    });

  return (
    <>
      <PageHeader title="My profile" description="How you appear to others in this shop." />
      <div className="max-w-xl space-y-4">
        <section className="flex flex-wrap items-center gap-4 rounded-xl border bg-card p-4">
          <Avatar name={user.displayName} url={user.avatarUrl} className="size-20 text-2xl" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-lg font-semibold">{user.displayName}</div>
            <div className="truncate text-sm text-muted-foreground">
              @{user.username} · {ROLE_LABEL[user.role]} at {shop.name}
            </div>
          </div>
          <div className="flex w-full gap-2 sm:w-auto">
            <Button
              type="button"
              variant="outline"
              className="flex-1 sm:flex-none"
              disabled={busy}
              onClick={() => {
                input.current?.click();
              }}
            >
              <ImagePlus aria-hidden="true" />
              {user.avatarUrl ? 'Change photo' : 'Add photo'}
            </Button>
            {user.avatarUrl ? (
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="Remove photo"
                disabled={busy}
                onClick={() => void removePhoto()}
              >
                <Trash2 aria-hidden="true" />
              </Button>
            ) : null}
          </div>
        </section>

        <form
          className="space-y-3 rounded-xl border bg-card p-4"
          onSubmit={(e) => {
            e.preventDefault();
            void saveName();
          }}
        >
          <TextField
            label="Display name"
            hint="Shown on receipts, the activity log and reports."
            value={name}
            maxLength={60}
            required
            onChange={(e) => {
              setName(e.target.value);
              setSaved(false);
            }}
          />
          <div className="flex items-center gap-3">
            <Button
              type="submit"
              disabled={busy || name.trim() === '' || name.trim() === user.displayName}
            >
              Save name
            </Button>
            {saved ? (
              <span role="status" className="flex items-center gap-1 text-sm text-muted-foreground">
                <Check className="size-4" aria-hidden="true" /> Saved
              </span>
            ) : null}
          </div>
        </form>

        <TwoFactorCard />

        {error ? <FormAlert>{error}</FormAlert> : null}
      </div>

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
        title="Adjust your photo"
      >
        {editing ? (
          <PhotoEditor
            source={editing}
            aspect={1}
            hint="Center your face in the square."
            onDone={(blob) => void uploadPhoto(blob)}
            onCancel={() => {
              setEditing(null);
            }}
          />
        ) : null}
      </Dialog>
    </>
  );
}
