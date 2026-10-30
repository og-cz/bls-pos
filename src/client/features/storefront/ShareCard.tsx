import { useMemo, useState } from 'react';
import { Check, Copy, Download, Share2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { qrModules, qrPath } from '@/lib/qr';

/** A printable PNG: the QR code with the shop name and a short line under it. */
async function qrPng(modules: boolean[][], shopName: string): Promise<Blob> {
  const cell = 16;
  const quiet = 4 * cell;
  const size = modules.length * cell + quiet * 2;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size + 140;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser cannot make images.');
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#000000';
  modules.forEach((row, r) => {
    row.forEach((dark, c) => {
      if (dark) ctx.fillRect(quiet + c * cell, quiet + r * cell, cell, cell);
    });
  });
  ctx.textAlign = 'center';
  ctx.font = 'bold 44px system-ui, sans-serif';
  ctx.fillText(shopName, size / 2, size + 40, size - 40);
  ctx.font = '32px system-ui, sans-serif';
  ctx.fillText('Scan to see our shop', size / 2, size + 100, size - 40);
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => {
      if (b) resolve(b);
      else reject(new Error('Could not make the image.'));
    }, 'image/png');
  });
}

/**
 * Share the public page (Section 9): the link to copy or send, and a QR code to print for
 * the counter or post on social media.
 */
export function ShareCard({
  url,
  shopName,
  slug,
}: {
  url: string;
  shopName: string;
  slug: string;
}) {
  const modules = useMemo(() => qrModules(url), [url]);
  const [copied, setCopied] = useState(false);
  const n = modules.length;
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  const path = qrPath(modules);

  return (
    <section className="space-y-4 rounded-xl border bg-card p-4">
      <h2 className="font-semibold">Share your page</h2>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <svg
          viewBox={`-4 -4 ${String(n + 8)} ${String(n + 8)}`}
          className="size-44 shrink-0 self-center rounded-lg bg-white sm:self-start"
          role="img"
          aria-label={`QR code for ${url}`}
          shapeRendering="crispEdges"
        >
          <path d={path} fill="#000" />
        </svg>
        <div className="min-w-0 flex-1 space-y-3">
          <div className="truncate rounded-md border bg-muted/50 px-3 py-2 font-mono text-sm">
            {url}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                void navigator.clipboard.writeText(url).then(() => {
                  setCopied(true);
                  setTimeout(() => {
                    setCopied(false);
                  }, 2000);
                });
              }}
            >
              {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
              {copied ? 'Copied' : 'Copy link'}
            </Button>
            {canShare ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  navigator.share({ title: shopName, url }).catch(() => {
                    // Closed without sharing: nothing to do.
                  });
                }}
              >
                <Share2 aria-hidden="true" />
                Share
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                void qrPng(modules, shopName).then((blob) => {
                  const href = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = href;
                  a.download = `${slug}-qr.png`;
                  a.click();
                  URL.revokeObjectURL(href);
                });
              }}
            >
              <Download aria-hidden="true" />
              Download QR
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            Print the QR code for your counter, or post it with the link on social media.
          </p>
        </div>
      </div>
    </section>
  );
}
