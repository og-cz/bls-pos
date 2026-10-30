import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Printer } from 'lucide-react';

import { useMe } from '@/app/session';
import { Button } from '@/components/ui/button';
import { PAYMENT_LABEL } from '@shared/checkout';
import { formatCents } from '@shared/money';
import type { Receipt } from '@shared/schemas/sales';

// Section 7.16: bls POS is not BIR-accredited; every receipt says so.
// TODO(tax professional): confirm the exact wording before selling bls POS to shops.
export const NOT_AN_INVOICE = 'This is not an official receipt or invoice.';

const dateTime = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

/** The receipt itself: plain, narrow, readable on screen and on a receipt printer. */
function ReceiptBody({
  receipt,
  shopName,
  currency,
}: {
  receipt: Receipt;
  shopName: string;
  currency: string;
}) {
  const money = (c: number) => formatCents(c, currency);
  const voided = receipt.status === 'voided';
  return (
    <div className="receipt mx-auto w-full max-w-xs font-mono text-sm leading-relaxed">
      <div className="text-center">
        <div className="text-base font-bold">{shopName}</div>
        <div>Sale #{receipt.number}</div>
        <div>{dateTime.format(receipt.createdAt)}</div>
        <div>Cashier: {receipt.cashier.displayName}</div>
        {voided ? (
          <div className="mt-2 border-2 border-current py-1 font-bold tracking-widest">VOIDED</div>
        ) : null}
      </div>
      <hr className="my-2 border-dashed border-current" />
      <table className="w-full">
        <tbody>
          {receipt.lines.map((l) => (
            <tr key={l.productId} className="align-top">
              <td className="pr-2">
                {l.name}
                <div className="text-xs opacity-80 tabular">
                  {l.quantity} × {money(l.unitPriceCents)}
                </div>
              </td>
              <td className="text-right whitespace-nowrap tabular">{money(l.lineTotalCents)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <hr className="my-2 border-dashed border-current" />
      <dl className="grid grid-cols-[1fr_auto] gap-x-2 tabular">
        {receipt.discountCents ? (
          <>
            <dt>Subtotal</dt>
            <dd className="text-right">{money(receipt.subtotalCents)}</dd>
            <dt>Discount</dt>
            <dd className="text-right">−{money(receipt.discountCents)}</dd>
          </>
        ) : null}
        <dt className="font-bold">TOTAL</dt>
        <dd className="text-right font-bold">{money(receipt.totalCents)}</dd>
        <dt>{PAYMENT_LABEL[receipt.paymentMethod] ?? receipt.paymentMethod}</dt>
        <dd className="text-right">{money(receipt.cashReceivedCents ?? receipt.totalCents)}</dd>
        {receipt.changeCents !== null ? (
          <>
            <dt>Change</dt>
            <dd className="text-right">{money(receipt.changeCents)}</dd>
          </>
        ) : null}
        {receipt.paymentReference ? (
          <>
            <dt>Ref</dt>
            <dd className="text-right">{receipt.paymentReference}</dd>
          </>
        ) : null}
      </dl>
      {voided && receipt.voidReason ? (
        <p className="mt-2">Void reason: {receipt.voidReason}</p>
      ) : null}
      <hr className="my-2 border-dashed border-current" />
      <p className="text-center text-xs">{NOT_AN_INVOICE}</p>
      <p className="text-center text-xs">Thank you!</p>
    </div>
  );
}

/**
 * After a sale: the change in large type, the receipt, Print and New sale. Printing sends
 * only the receipt to the printer (see .print-receipt in globals.css), sized for 58/80 mm
 * receipt printers and fine on A4.
 */
/** A finished sale. After checkout the second button starts a new sale; elsewhere it's `action`. */
export function ReceiptView({
  receipt,
  onNewSale,
  action,
}: {
  receipt: Receipt;
  onNewSale?: () => void;
  action?: ReactNode;
}) {
  const { shop } = useMe();
  const money = (c: number) => formatCents(c, shop.currency);
  return (
    <div className="space-y-5">
      {receipt.changeCents !== null ? (
        <div className="rounded-xl bg-emerald-500/10 p-4 text-center">
          <div className="text-sm text-muted-foreground">Change</div>
          <div className="text-4xl font-bold text-emerald-700 tabular dark:text-emerald-400">
            {money(receipt.changeCents)}
          </div>
        </div>
      ) : null}

      <div className="max-h-[45dvh] overflow-y-auto rounded-xl border bg-white p-4 text-black">
        <ReceiptBody receipt={receipt} shopName={shop.name} currency={shop.currency} />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Button
          type="button"
          variant="outline"
          size="lg"
          onClick={() => {
            window.print();
          }}
        >
          <Printer aria-hidden="true" />
          Print
        </Button>
        {onNewSale ? (
          <Button type="button" size="lg" onClick={onNewSale}>
            New sale
          </Button>
        ) : (
          action
        )}
      </div>

      {/* The printed copy: a direct child of <body>, the only thing shown when printing. */}
      {createPortal(
        <div className="print-receipt" aria-hidden="true">
          <ReceiptBody receipt={receipt} shopName={shop.name} currency={shop.currency} />
        </div>,
        document.body,
      )}
    </div>
  );
}
