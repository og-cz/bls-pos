import type { Role } from '@shared/roles';

// Help articles (Section 8.3), bundled with the app so they work offline and load fast.
// Written for shop owners and cashiers: short sentences, steps in order.

export type Article = {
  id: string;
  title: string;
  summary: string;
  /** Lowest role the article is for (staff articles show to everyone). */
  minRole: Role;
  body: string;
};

export const ARTICLES: Article[] = [
  {
    id: 'getting-started',
    title: 'Getting started',
    summary: 'From signup to your first sale in a few minutes.',
    minRole: 'admin',
    body: `
1. **Set up your shop.** After signing up, the setup guide asks for your shop's name and kind, your colors and logo, and your first products. Every step can be skipped and done later.
2. **Add products.** Go to **Products** and tap **Add product**. Give it a name, price and, if you count it, the stock you have now. Add a photo so staff can tell similar items apart.
3. **Add your staff.** In **Staff**, add each person. Give them the shop code, their username and the temporary password shown once.
4. **Make a test sale.** Open **Sell**, tap a product, then **Charge**. You can void a test sale afterwards from **Sales**.

## Where things are

- **Dashboard:** today's sales and the last 7 or 30 days.
- **Sell** and **Sales:** ring up sales; see, reprint or void them.
- **Inventory** and **Products:** stock counts and your product list.
- **Staff**, **Shop page**, **Branding** and **Activity:** your team, your public page, your look and who did what.
`,
  },
  {
    id: 'selling',
    title: 'Selling',
    summary: 'Ringing up a sale, taking cash and printing the receipt.',
    minRole: 'staff',
    body: `
1. Open **Sell**. Find a product by tapping its tile, typing its name or SKU, or scanning its barcode.
2. Each tap adds one. Change quantities in the cart with − and +.
3. Tap **Charge**. For cash, tap a quick amount or type what the customer gave; the change shows in large numbers.
4. For GCash, Maya or card, choose **Other** and type the reference number.
5. Tap **Complete sale**. Print the receipt or start a new sale.

## Mistakes

Only the owner and admins can void a sale. Open it in **Sales**, tap **Void** and write the reason. The items go back into stock.

Receipts from bls POS are not official receipts or invoices.
`,
  },
  {
    id: 'inventory',
    title: 'Inventory',
    summary: 'Restocking, taking out damaged items and low stock alerts.',
    minRole: 'staff',
    body: `
- **Restock** (owner and admins): when a delivery arrives, tap **Restock** on the product and enter how many came in.
- **Deduct** (everyone): when an item is damaged, expired, used or lost, tap **Deduct**, enter how many and pick the reason.
- **Low stock:** a product turns yellow at its "low stock alert" number and red when none are left. The dashboard shows how many need restocking.

Every change is kept in **Recent stock changes**, with who did it and why. Sales take stock out automatically.
`,
  },
  {
    id: 'staff',
    title: 'Staff and roles',
    summary: 'Who can do what, and adding or removing people.',
    minRole: 'admin',
    body: `
- **Owner:** everything, including adding admins.
- **Admin:** products, prices, restocking, staff, reports and voids.
- **Staff:** selling, taking out stock with a reason, and their own sales for today. Staff never see costs or profit.

## Adding someone

In **Staff**, tap **Add**, enter their name and a username, and share the shop code, username and temporary password with them in person.

## When someone leaves

Tap **Deactivate**. They are logged out at once, and their past sales stay in your records.
`,
  },
  {
    id: 'branding',
    title: 'Branding',
    summary: 'Your colors, logo, cover photo and font.',
    minRole: 'admin',
    body: `
Open **Branding**. Pick a preset, choose any color on the wheel, or take a color from your logo. The whole app changes as you pick so you can see it; nothing is saved until you tap **Save**.

- **Look:** automatic, light or dark; one of five fonts; sharp, soft or round corners.
- **Logo and cover photo:** crop them before uploading. Use the slider to darken the cover so your shop name stays readable.

If a color would make text hard to read, it is adjusted slightly and you are told.
`,
  },
  {
    id: 'storefront',
    title: 'Your shop page',
    summary: 'A public page with your products, a link and a QR code.',
    minRole: 'admin',
    body: `
1. Open **Shop page** and turn on **Public shop page**.
2. Choose whether to show prices and "Available / Sold out". Exact stock counts and costs are never shown.
3. Write a short description: what you sell, where you are, your hours.
4. **Copy link**, **Share**, or **Download QR** to print for your counter.

Choose which products appear with **Show on your shop page** when editing a product.
`,
  },
  {
    id: 'install',
    title: 'Install on your phone',
    summary: 'Open bls POS like an app, from your home screen.',
    minRole: 'staff',
    body: `
## Android (Chrome)

1. Open bls POS in Chrome.
2. Tap the ⋮ menu, then **Install app** or **Add to Home screen**.

## iPhone (Safari)

1. Open bls POS in Safari.
2. Tap the **Share** button, then **Add to Home Screen**.

It then opens full screen from its own icon.
`,
  },
  {
    id: 'offline',
    title: 'Selling without internet',
    summary: 'What happens when the connection drops.',
    minRole: 'staff',
    body: `
Keep selling when the internet drops. Open bls POS while online at least once on the phone or PC, so it has your product list.

- The header shows **Offline**. Sell as usual: the receipt says the sale number comes when you are back online.
- Sales are kept on this device and sent by themselves when the connection returns, oldest first. Sending twice never records a sale twice.
- If one can't be recorded (for example another till sold the last item meanwhile), it shows under **Sales → On this device → Needs review**. Try it again, or the owner or an admin can discard it. Nothing is dropped without someone deciding.
- Logging out removes sales that were not sent yet, so connect first. bls POS warns you.

Prices and stock while offline are from the last time the list loaded.
`,
  },
  {
    id: 'security',
    title: 'Security tips',
    summary: 'Keeping your shop and money safe.',
    minRole: 'staff',
    body: `
- Use a long password you don't use anywhere else. A short sentence works well.
- Never share your login. Give every person their own, so the activity log shows who did what.
- **Owners:** keep your recovery codes on paper, away from your phone. They are the only way back in if you forget your password. Make new ones in setup if they are lost.
- Deactivate staff the day they leave.
- Check **Activity** now and then for voids and stock changes you don't recognize.
`,
  },
  {
    id: 'faq',
    title: 'Questions',
    summary: 'Common questions, short answers.',
    minRole: 'staff',
    body: `
## Is bls POS free?

Yes. The free plan covers up to 5,000 products and 5 staff accounts.

## Are the receipts official?

No. bls POS is not BIR-accredited, and every receipt says it is not an official receipt or invoice.

## I forgot my password.

Staff: ask the owner or an admin. In **Staff**, they tap **Manage → Reset password** and give you a new temporary password. Owner: use **Forgot password** on the login page with one of your recovery codes. Change your own password any time in **My profile**.

## Can I bring my product list from a spreadsheet?

Yes. In **Products**, tap **Import** and choose your CSV or Excel file. You can also export everything as a backup.
`,
  },
];
