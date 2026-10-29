import { cn } from '@/lib/utils';
import { APP_NAME } from '@shared/app';

/**
 * The Bilis POS mark (public/logo.svg). Drawn as a CSS mask so it takes the current text
 * color and stays visible in light and dark mode.
 */
export function BrandLogo({
  className,
  decorative = false,
}: {
  className?: string;
  /** True when the app name is already written next to it. */
  decorative?: boolean;
}) {
  return (
    <span
      {...(decorative
        ? { 'aria-hidden': true }
        : { role: 'img', 'aria-label': `${APP_NAME} logo` })}
      className={cn('inline-block size-10 shrink-0 bg-current', className)}
      style={{
        maskImage: 'url(/logo.svg)',
        maskRepeat: 'no-repeat',
        maskPosition: 'center',
        maskSize: 'contain',
      }}
    />
  );
}
