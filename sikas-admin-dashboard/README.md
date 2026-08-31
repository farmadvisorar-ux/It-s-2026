# Sikas Admin Dashboard

The web console for the Sikas admin platform. React + Vite, talking to
[`sikas-auth-api`](../sikas-auth-api) over its REST endpoints.

## What's here

- **Sign-in** with email + password, then a second factor
  — an authenticator code, or a 6-digit code emailed to you if you haven't
  enrolled an authenticator yet.
- **Password reset** request flow.
- **Overview** — live counts (admins, 2FA coverage, sessions, sign-ins,
  events, failures) plus a 14-day chart of authentication events.
- **Audit log** — every auth event, paginated and filterable by outcome.
- **Sessions** — your live sessions, with one-click revoke.
- **Admins** — the account roster (owners and platform admins only).
- Light and dark themes, following the OS by default with a manual override.

Every figure on every screen comes from the database. There is no mock data.

## Running it

The API must be up first — see [`../sikas-auth-api/README.md`](../sikas-auth-api/README.md)
for Postgres, Redis, migrations, and creating your first admin account.

```bash
cd sikas-admin-dashboard
npm install
npm run dev
```

Open <http://localhost:5173>.

### Configuration

Copy `.env.example` to `.env` if your API isn't on the default port:

```env
VITE_API_URL=http://localhost:9000
```

The API must allow this origin. Its `CORS_ORIGINS` defaults to
`http://localhost:5173,http://127.0.0.1:5173`, which covers local development.
Note that `localhost` and `127.0.0.1` are *different* origins to a browser —
if you serve the dashboard from one, the API has to list that exact one.

## Signing in for the first time

1. Create an account: `cd ../sikas-auth-api && npm run seed:admin -- you@example.com 'YourPassword123' owner`
2. Open the dashboard and sign in with those credentials.
3. Because the account has no authenticator yet, the second step is a code
   sent by email. With SMTP unconfigured, that code is printed to the **API
   server's console** — copy it from there.
4. To send real email instead, set the SMTP variables in the API's `.env`
   (Gmail works free, 500/day — see the API README).

## How auth works in the client

- `POST /v1/auth/login` returns a `session_id` and which second factor to use.
- The code is verified via `/verify-totp` or `/verify-email-otp`, which returns
  an access token (1 hour) and a refresh token (7 days).
- Tokens live in `localStorage`; the MFA `session_id` lives in `sessionStorage`
  so sign-out can invalidate the server session.
- `src/lib/api.ts` retries once on a 401 by refreshing the access token, and
  collapses concurrent refreshes into a single request. If the refresh fails,
  tokens are cleared and you land back on the login screen.
- On reload the app calls `/v1/auth/me` to restore the session rather than
  forcing a fresh sign-in.

## Layout

```
src/
├── main.tsx              # entry; applies stored theme before first paint
├── App.tsx               # auth gate, rail navigation, sign-out
├── styles.css            # design tokens and every component style
├── lib/
│   ├── api.ts            # typed API client, token storage, refresh handling
│   └── format.ts         # relative times, user-agent and action labels
├── components/
│   └── Chart.tsx         # 14-day stacked activity chart (hand-drawn SVG)
└── pages/
    ├── Login.tsx         # credentials, MFA, password reset, theme toggle
    ├── Overview.tsx      # stat tiles, chart, recent activity
    ├── AuditLog.tsx      # paginated, filterable event table
    ├── Sessions.tsx      # live sessions with revoke
    └── Admins.tsx        # admin roster (role-gated)
```

## Build

```bash
npm run typecheck   # tsc --noEmit
npm run build       # -> dist/
npm run preview     # serve the production build
```

`dist/` is static — host it on any static host, or serve it from the API
behind the same origin to avoid CORS entirely.

## Not built yet

The console currently covers authentication, access, and audit. The
advertiser, campaign, ledger, and payout screens described in
`../SIKAS-SELF-DISTRIBUTED-APP-SPEC.md` need their backing endpoints before
they can show anything real, and are deliberately absent rather than stubbed
with placeholder numbers.
