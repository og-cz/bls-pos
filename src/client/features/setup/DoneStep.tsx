import { PartyPopper, ShoppingCart } from 'lucide-react';

import { Button } from '@/components/ui/button';

/** Step 6: all set. The quickest way to learn is a first test sale. */
export function DoneStep({ onFinish, busy }: { onFinish: (path: string) => void; busy: boolean }) {
  return (
    <div className="space-y-6 py-6 text-center">
      <PartyPopper className="mx-auto size-12 text-primary" aria-hidden="true" />
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Your shop is ready</h1>
        <p className="text-muted-foreground">
          Try a test sale to see how it works. You can void it afterwards from Sales.
        </p>
      </div>
      <div className="mx-auto flex max-w-sm flex-col gap-2">
        <Button
          type="button"
          size="lg"
          disabled={busy}
          onClick={() => {
            onFinish('/sell');
          }}
        >
          <ShoppingCart aria-hidden="true" />
          Make your first test sale
        </Button>
        <Button
          type="button"
          size="lg"
          variant="outline"
          disabled={busy}
          onClick={() => {
            onFinish('/');
          }}
        >
          Go to the dashboard
        </Button>
      </div>
    </div>
  );
}
