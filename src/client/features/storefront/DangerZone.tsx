import { useState } from 'react';
import { Trash2 } from 'lucide-react';

import { useMe } from '@/app/session';
import { FormAlert, PasswordField, TextField } from '@/components/field';
import { Link } from '@/components/link';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { ApiClientError, apiPost } from '@/lib/api';
import { clearOffline } from '@/lib/offline-store';
import { navigate } from '@/lib/router';

/**
 * Deleting the shop (Section 7.14), owner only. Closes it at once and erases everything
 * 30 days later. Asks for the shop code and password, and points to a backup first.
 */
export function DangerZone() {
  const { user, shop } = useMe();
  const [open, setOpen] = useState(false);
  const [slug, setSlug] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (user.role !== 'owner') return null;

  return (
    <section className="max-w-2xl space-y-3 rounded-xl border border-destructive/40 p-4">
      <h2 className="font-semibold text-destructive">Delete shop</h2>
      <p className="text-sm text-muted-foreground">
        Closes the shop for everyone right away. Everything (products, sales, staff, photos) is
        erased for good after 30 days. Download a backup first from{' '}
        <Link href="/products" className="font-medium text-primary hover:underline">
          Products → Export
        </Link>
        .
      </p>
      <Button
        type="button"
        variant="outline"
        className="border-destructive/50 text-destructive"
        onClick={() => {
          setOpen(true);
        }}
      >
        <Trash2 aria-hidden="true" />
        Delete this shop
      </Button>

      <Dialog open={open} onOpenChange={setOpen} title="Delete this shop?">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            setBusy(true);
            setErrors({});
            setError(null);
            apiPost('/shop/delete', { shopSlug: slug, password })
              .then(async () => {
                await clearOffline();
                navigate('/login', { replace: true });
              })
              .catch((err: unknown) => {
                if (err instanceof ApiClientError && Object.keys(err.fields).length) {
                  setErrors(err.fields);
                } else {
                  setError(err instanceof Error ? err.message : 'Could not delete the shop.');
                }
              })
              .finally(() => {
                setBusy(false);
              });
          }}
        >
          <p className="text-sm">
            Type your shop code <strong className="font-mono">{shop.slug}</strong> and your password
            to confirm. Nobody will be able to log in after this.
          </p>
          <TextField
            label="Shop code"
            autoComplete="off"
            value={slug}
            onChange={(e) => {
              setSlug(e.target.value);
            }}
            error={errors.shopSlug}
            required
          />
          <PasswordField
            label="Your password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
            }}
            error={errors.password}
            required
          />
          {error ? <FormAlert>{error}</FormAlert> : null}
          <Button
            type="submit"
            variant="destructive"
            size="lg"
            className="w-full"
            disabled={busy || slug.trim().toLowerCase() !== shop.slug || !password}
          >
            Delete shop
          </Button>
        </form>
      </Dialog>
    </section>
  );
}
