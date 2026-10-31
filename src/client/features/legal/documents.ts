// Privacy policy and terms (Section 7.14), written with the Philippine Data Privacy Act of
// 2012 (RA 10173) in mind. TODO(lawyer): have a lawyer review both before offering bls POS
// to other businesses, and fill in the operator's name and contact.

export const LEGAL_UPDATED = '31 October 2026';

export const PRIVACY = `
bls POS is a point-of-sale app for small shops. This policy explains what personal data it keeps, why, for how long, and your rights under the Data Privacy Act of 2012 (RA 10173).

## Who is responsible

The **shop** that uses bls POS decides what is recorded about its staff and sales, so the shop is the personal information controller. The operator of this bls POS service processes that data for the shop. To reach the operator about privacy, use the contact listed by whoever runs this service.

## What is kept

- **Shop details:** name, kind of shop, description, logo, cover photo and colors.
- **People who log in:** display name, username, role, an optional photo, a password stored only as a salted, one-way hash, and (if turned on) an encrypted two-step login secret. Owners also have one-way hashes of their recovery codes.
- **Sales and stock:** products, prices, stock changes, sales and receipts, with who made each one.
- **Security records:** an activity log of important actions, and for each login session its device type, an IP address turned into a one-way keyed hash (never the address itself) and times.

bls POS does not ask for customers' names, phone numbers or payment card details. A payment reference typed for an "Other" payment (for example a GCash reference) is kept with the sale.

## Why

To run the shop's point of sale: selling, stock, reports, staff logins, receipts. To keep accounts safe: limiting login attempts, detecting misuse and showing the shop who did what. Nothing is sold, rented or shared for advertising.

## How long

- Login sessions end after 30 days at most (12 hours idle for staff).
- Nightly backups are kept 14 days.
- Shop data stays while the shop exists. When the owner deletes the shop, it closes at once and everything is erased 30 days later.

## Where

Data is stored on Cloudflare's infrastructure (database and file storage), which may be outside the Philippines, with access limited to the operator.

## Your rights

You may ask to be informed, to access and correct your data, to object, to have it erased or blocked, and to receive a copy in a common format. Owners can export all shop data from **Products → Export** and delete the shop from **Shop page**. Staff can change their name and photo in **My profile** and ask the shop owner for anything else. You may also file a complaint with the National Privacy Commission (privacy.gov.ph).

## Security

Passwords and recovery codes are stored only as one-way hashes; two-step login secrets are encrypted; all traffic is encrypted (HTTPS); each shop can only ever reach its own data; important actions are logged in a tamper-evident activity log.

## Cookies

bls POS uses one cookie, to keep you logged in. It is required for the app to work and is not used for tracking. Settings like theme and text size are saved on your device only.

## Changes

If this policy changes, the date below changes too.
`;

export const TERMS = `
These terms apply to using bls POS. By creating a shop or logging in, you agree to them.

## The service

bls POS helps small shops record sales and stock. The free edition is offered as is, without a promise that it will always be available or free of errors. Keep your own backups (**Products → Export**).

## Not an official receipt

bls POS is **not BIR-accredited**. Its receipts are not official receipts or invoices. Each shop is responsible for its own tax obligations, including issuing official receipts where the law requires them.

## Your account

Keep your password and recovery codes private. The owner is responsible for the shop's staff accounts and what is done with them. Give every person their own login.

## Your data

Your shop's data belongs to your shop. You can export it any time and delete the shop. How personal data is handled is explained in the Privacy policy.

## Fair use

Don't use bls POS for anything illegal, to sell prohibited goods, to break into other shops' data, or to overload the service. Accounts that do may be closed.

## Limits of liability

To the extent the law allows, the operator is not liable for lost sales, profits or data arising from using the free edition. Nothing in these terms limits rights you have under Philippine law that can't be limited.

## Changes

If these terms change, the date below changes too. Continuing to use bls POS after a change means you accept it.
`;
