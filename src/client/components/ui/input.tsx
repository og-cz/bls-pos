import * as React from 'react';

import { cn } from '@/lib/utils';

// 44px tall (h-11) so it is easy to tap on a phone (Section 6.1). 16px text stops iOS zooming.
const fieldClasses =
  'flex h-11 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40';

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return <input type={type} data-slot="input" className={cn(fieldClasses, className)} {...props} />;
}

function NativeSelect({ className, ...props }: React.ComponentProps<'select'>) {
  return (
    <select
      data-slot="select"
      className={cn(fieldClasses, 'appearance-auto', className)}
      {...props}
    />
  );
}

export { Input, NativeSelect };
