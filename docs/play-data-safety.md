# Play Console — Data safety answer sheet (FarmOS)

Use this to fill **App content → Data safety**. Answers reflect the app's intended
behavior. ⚠️ Keep it accurate: before public launch the backend must use HTTPS and
support data deletion (both assumed "Yes" below).

## Overview questions
| Question | Answer |
|---|---|
| Does your app collect or share any required user data types? | **Yes** |
| Is all user data encrypted in transit? | **Yes** (HTTPS/TLS) |
| Do you provide a way for users to request data deletion? | **Yes** (email request; in-app later) |

## Data types — collected (and shared only with user consent)
For each: Collected = Yes. "Shared" = Yes **only** for the items below, and only via the
in-app consent flow (banks/NBFCs/insurers/FPOs/government). Mark processing as **not ephemeral**,
collection **required** (app needs it to function) unless noted optional.

| Data type | Collected | Shared (with consent) | Purpose(s) |
|---|---|---|---|
| Name | Yes | Yes | App functionality, Account management |
| Phone number | Yes | No | App functionality, Account management |
| Precise location (field GPS/boundary) | Yes | Yes | App functionality |
| Financial info — credit score | Yes | Yes | App functionality |
| Financial info — other (income/expense ledger) | Yes | No | App functionality |
| Photos (disease scan, optional) | Yes (optional) | No | App functionality |
| App activity / other farm records (crop, soil, yield, market) | Yes | Yes | App functionality, Analytics |
| App info & performance (diagnostics/crash) | Yes | No | App functionality (diagnostics) |

> Identity note: raw Aadhaar is **not** stored (tokenized). Do **not** declare a
> "Government ID" data type if you only store a token reference; if you ever store the
> actual number, you must declare it.

## Purposes legend (select per type as above)
- **App functionality** — core features (twin, advisory, scores, marketplace).
- **Account management** — registration/login.
- **Analytics** — improving recommendations/models (only on farm records; pseudonymous).

## Security practices section
- Data encrypted in transit: **Yes**
- Users can request data deletion: **Yes** (contact sspandian.here@gmail.com)
- Committed to Play Families Policy: **No** (app is 18+, not for children)

## Other App-content sections (quick answers)
| Section | Answer |
|---|---|
| Privacy policy URL | the GitHub Pages URL (see repo) |
| Ads | No, app does not contain ads |
| Content rating | Utility/reference; answer "No" to all sensitive-content questions → Everyone |
| Target audience | 18+ (do not target children) |
| Government apps | No |
| Sign in details | App requires phone registration — provide reviewer instructions/test login |
