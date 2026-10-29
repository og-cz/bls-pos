import { useState } from 'react';
import { Check, Copy, Download, Printer } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { APP_NAME } from '@shared/app';

type Props = { codes: string[]; shopSlug: string; username: string; onDone: () => void };

function codesText({ codes, shopSlug, username }: Omit<Props, 'onDone'>) {
  return [
    `${APP_NAME} recovery codes`,
    `Shop code: ${shopSlug}`,
    `Username: ${username}`,
    '',
    'Each code works once. Use one to set a new password if you forget yours.',
    '',
    ...codes,
    '',
  ].join('\n');
}

/**
 * Shown once, right after signup (Section 7.12). Only hashes are stored on the server,
 * so the owner must save these now.
 */
export function RecoveryCodes(props: Props) {
  const { codes, onDone } = props;
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);

  function download() {
    const blob = new Blob([codesText(props)], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${props.shopSlug}-recovery-codes.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(codesText(props));
      setCopied(true);
    } catch {
      // Clipboard can be blocked; Download and Print still work.
    }
  }

  return (
    <div className="space-y-6">
      <p className="hidden text-sm print:block">
        Shop code: <strong>{props.shopSlug}</strong> · Username: <strong>{props.username}</strong>
      </p>
      <ol
        className="grid grid-cols-2 gap-2 rounded-lg bg-muted p-4 font-mono text-base tabular print:bg-transparent"
        aria-label="Recovery codes"
      >
        {codes.map((code) => (
          <li key={code} className="text-center tracking-wider">
            {code}
          </li>
        ))}
      </ol>

      <div className="grid grid-cols-3 gap-2 print:hidden">
        <Button type="button" variant="outline" onClick={download}>
          <Download aria-hidden="true" />
          Download
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            window.print();
          }}
        >
          <Printer aria-hidden="true" />
          Print
        </Button>
        <Button type="button" variant="outline" onClick={() => void copy()}>
          {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>

      <div className="space-y-4 print:hidden">
        <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm">
          <input
            type="checkbox"
            className="mt-0.5 size-5 shrink-0 accent-primary"
            checked={saved}
            onChange={(e) => {
              setSaved(e.target.checked);
            }}
          />
          <span>I saved these codes somewhere safe, away from this device.</span>
        </label>
        <Button type="button" size="lg" className="w-full" disabled={!saved} onClick={onDone}>
          Continue
        </Button>
      </div>
    </div>
  );
}
