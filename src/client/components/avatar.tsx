import { cn } from '@/lib/utils';

/** A person's photo, or the first letter of their name when they have none. */
export function Avatar({
  name,
  url,
  className,
}: {
  name: string;
  url: string | null;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/10 text-sm font-semibold text-primary',
        className,
      )}
    >
      {url ? (
        <img src={url} alt="" loading="lazy" decoding="async" className="size-full object-cover" />
      ) : (
        name.slice(0, 1).toUpperCase()
      )}
    </span>
  );
}
