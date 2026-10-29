# Roadmap

> The project was renamed from **POS Fast** to **Bilis POS** on 2026-10-29. `docs/MASTER_PROMPT.md` keeps the original name; wherever it says "POS Fast", `pos-fast` or `__Host-pf_session`, read "Bilis POS", `bilis-pos` and `__Host-bp_session`.

> The master prompt (§12) holds the full dated commit plan. Dates are a **plan**: commits
> are made when the work is actually done, with real timestamps. Work started
> 2026-10-29, ahead of the planned 2027-01-16 start, so real dates run earlier than the plan.

## Free edition — v1.0.0

| Phase | Scope                                                           | Status                                                                          |
| ----- | --------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| 0     | Foundation: repo, tooling, client + worker scaffold, CI, limits | **Code done** — preview deploy and green CI need GitHub push + Cloudflare login |
| 1     | Database and authentication                                     | Not started                                                                     |
| 2     | Tenancy, roles and staff                                        | Not started                                                                     |
| 3     | Products and inventory                                          | Not started                                                                     |
| 4     | Selling                                                         | Not started                                                                     |
| 5     | Dashboard and reports                                           | Not started                                                                     |
| 6     | Branding and storefront                                         | Not started                                                                     |
| 7     | Onboarding and help                                             | Not started                                                                     |
| 8     | PWA and offline                                                 | Not started                                                                     |
| 9     | Security hardening                                              | Not started                                                                     |
| 10    | Polish and launch                                               | Not started                                                                     |

## Decisions needed

- ~~**Phase 1:** PBKDF2 iteration count vs. the 10 ms free CPU limit~~ — decided 2026-10-29: 100,000, measured on a real Free account (see `LIMITS.md`).
- **License:** MIT was chosen as a placeholder. With a Paid edition planned, consider
  whether a more protective license (e.g. AGPL-3.0 or source-available) fits better
  _before_ the repo is public.

## Parked for the Paid edition (do NOT build in Phases 0–10)

Any paid-feature idea that comes up during Free work gets added here instead of built.

| Phase | Feature                                                    | Plugs into                            |
| ----- | ---------------------------------------------------------- | ------------------------------------- |
| 11    | Subscriptions & billing                                    | `plan`, entitlements, `subscriptions` |
| 12    | GCash / Maya / card payments                               | `PaymentAdapter`                      |
| 13    | Email/SMS receipts, email password reset, low-stock alerts | `NotificationAdapter`                 |
| 14    | Multiple branches, stock transfers                         | `branches`, multi-shop users          |
| 15    | Customers & loyalty                                        | `customers`                           |
| 16    | Advanced reports, longer history                           | entitlements                          |
| 17    | AI insights, AI setup assistant                            | `AiAdapter`                           |
| 18    | Storefront online ordering, custom domains                 | storefront                            |
| 19    | Public API keys and webhooks                               | `api_keys`, `webhooks`                |
