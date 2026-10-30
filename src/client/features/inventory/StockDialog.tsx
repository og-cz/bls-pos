import { useState, type SyntheticEvent } from 'react';

import { FormAlert, SelectField, TextField } from '@/components/field';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { ApiClientError, apiPost } from '@/lib/api';
import { validate, type FieldErrors } from '@/lib/form';
import {
  DEDUCT_REASONS,
  deductSchema,
  restockSchema,
  type DeductReason,
} from '@shared/schemas/inventory';

import { REASON_LABEL } from './labels';
import type { ProductDto } from '@shared/schemas/products';

export type StockAction = { kind: 'restock' | 'deduct'; product: ProductDto };

type Props = {
  action: StockAction | null;
  onClose: () => void;
  onDone: (result: { productId: string; stock: number }) => void;
};

/** Restock (admins) or take stock out with a reason (everyone). Every change is logged. */
export function StockDialog({ action, onClose, onDone }: Props) {
  return (
    <Dialog
      open={action !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={action?.kind === 'restock' ? 'Restock' : 'Take out stock'}
    >
      {action ? (
        <StockForm key={`${action.kind}:${action.product.id}`} action={action} onDone={onDone} />
      ) : null}
    </Dialog>
  );
}

function StockForm({ action, onDone }: { action: StockAction; onDone: Props['onDone'] }) {
  const { kind, product } = action;
  const [quantity, setQuantity] = useState('1');
  const [reason, setReason] = useState<DeductReason | ''>('');
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: SyntheticEvent) {
    e.preventDefault();
    setFormError(null);
    const qty = /^\d+$/.test(quantity.trim()) ? Number(quantity.trim()) : Number.NaN;
    const body = {
      productId: product.id,
      quantity: qty,
      ...(kind === 'deduct' ? { reason: reason || undefined } : {}),
      ...(note.trim() ? { note: note.trim() } : {}),
    };
    const checked = validate(kind === 'restock' ? restockSchema : deductSchema, body);
    if (checked.errors) {
      setErrors(checked.errors);
      return;
    }
    setBusy(true);
    try {
      onDone(
        await apiPost<{ productId: string; stock: number }>(`/inventory/${kind}`, checked.data),
      );
    } catch (err) {
      const apiErr =
        err instanceof ApiClientError
          ? err
          : new ApiClientError(0, 'INTERNAL', 'Something went wrong.');
      setErrors(apiErr.fields);
      setFormError(Object.keys(apiErr.fields).length ? null : apiErr.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e) => void onSubmit(e)} noValidate className="space-y-5">
      <div>
        <div className="font-medium">{product.name}</div>
        <div className="text-sm text-muted-foreground tabular">
          {product.stock.toLocaleString()} in stock now
        </div>
      </div>
      {formError ? <FormAlert>{formError}</FormAlert> : null}
      <TextField
        label={kind === 'restock' ? 'How many to add' : 'How many to take out'}
        name="quantity"
        inputMode="numeric"
        className="tabular"
        value={quantity}
        onChange={(e) => {
          setQuantity(e.target.value);
        }}
        error={errors.quantity}
        autoFocus
      />
      {kind === 'deduct' ? (
        <SelectField
          label="Reason"
          name="reason"
          value={reason}
          onChange={(e) => {
            setReason(e.target.value as DeductReason | '');
          }}
          error={errors.reason}
        >
          <option value="" disabled>
            Pick a reason
          </option>
          {DEDUCT_REASONS.map((r) => (
            <option key={r} value={r}>
              {REASON_LABEL[r]}
            </option>
          ))}
        </SelectField>
      ) : null}
      <TextField
        label="Note"
        name="note"
        placeholder={kind === 'restock' ? 'e.g. Delivery from supplier' : 'Optional'}
        value={note}
        onChange={(e) => {
          setNote(e.target.value);
        }}
        error={errors.note}
        maxLength={200}
      />
      <Button type="submit" size="lg" className="w-full" disabled={busy}>
        {busy ? 'Saving…' : kind === 'restock' ? 'Add stock' : 'Take out'}
      </Button>
    </form>
  );
}
