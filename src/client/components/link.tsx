import type { ComponentProps, MouseEvent } from 'react';

import { navigate } from '@/lib/router';

/** An in-app link: a real <a href> (so open-in-new-tab works) that navigates without a reload. */
export function Link({ href, onClick, ...props }: ComponentProps<'a'> & { href: string }) {
  function handleClick(e: MouseEvent<HTMLAnchorElement>) {
    onClick?.(e);
    // Let the browser handle new tabs, downloads and modified clicks.
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
      return;
    }
    e.preventDefault();
    navigate(href);
  }
  return <a href={href} onClick={handleClick} {...props} />;
}
