import { useEffect, useRef, useState } from 'react';

// Cloudflare Turnstile (Section 7.3). The token proves a human is here; the server verifies it.
// Cloudflare's always-pass test key is used in development when no key is configured.
const TEST_SITE_KEY = '1x00000000000000000000AA';
const SITE_KEY: string | undefined =
  import.meta.env.VITE_TURNSTILE_SITE_KEY || (import.meta.env.DEV ? TEST_SITE_KEY : undefined);

const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

type TurnstileApi = {
  render: (
    el: HTMLElement,
    options: {
      sitekey: string;
      callback: (token: string) => void;
      'expired-callback': () => void;
      'error-callback': () => void;
      theme?: 'auto' | 'light' | 'dark';
      size?: 'normal' | 'flexible' | 'compact';
    },
  ) => string;
  remove: (id: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let scriptLoad: Promise<TurnstileApi> | undefined;

function loadTurnstile(): Promise<TurnstileApi> {
  scriptLoad ??= new Promise<TurnstileApi>((resolve, reject) => {
    if (window.turnstile) {
      resolve(window.turnstile);
      return;
    }
    const script = document.createElement('script');
    script.src = SCRIPT_URL;
    script.async = true;
    script.onload = () => {
      if (window.turnstile) resolve(window.turnstile);
      else reject(new Error('Turnstile did not load'));
    };
    script.onerror = () => {
      scriptLoad = undefined; // allow a retry on the next mount
      reject(new Error('Turnstile did not load'));
    };
    document.head.appendChild(script);
  });
  return scriptLoad;
}

/**
 * Renders the Turnstile check and reports its token (null when expired or failed).
 * Tokens work once: remount it (change its `key`) after each submit for a fresh one.
 */
export function Turnstile({ onToken }: { onToken: (token: string | null) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const onTokenRef = useRef(onToken);
  const [failed, setFailed] = useState(!SITE_KEY);

  useEffect(() => {
    onTokenRef.current = onToken;
  });

  useEffect(() => {
    if (!SITE_KEY) return;
    let id: string | undefined;
    let api: TurnstileApi | undefined;
    let cancelled = false;
    loadTurnstile()
      .then((t) => {
        if (cancelled || !ref.current) return;
        api = t;
        id = t.render(ref.current, {
          sitekey: SITE_KEY,
          theme: 'auto',
          size: 'flexible',
          callback: (token) => {
            onTokenRef.current(token);
          },
          'expired-callback': () => {
            onTokenRef.current(null);
          },
          'error-callback': () => {
            onTokenRef.current(null);
          },
        });
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      if (api && id) api.remove(id);
    };
  }, []);

  if (failed) {
    return (
      <p className="text-sm text-destructive" role="alert">
        The security check could not load. Check your connection and reload the page.
      </p>
    );
  }
  return <div ref={ref} className="min-h-[65px]" />;
}
