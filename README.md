# WazaBolt

**Power your business on WhatsApp.** WazaBolt is a WhatsApp business automation platform for
African businesses, starting in Cameroon. Businesses connect their business WhatsApp account to
WazaBolt to automate replies, share their catalog, capture orders and manage customers — with
their team always able to take over.

WazaBolt is an independent product and is not affiliated with WhatsApp or Meta. WhatsApp is an
integration channel, connected through Meta's official WhatsApp Business Platform.

- **WhatsApp** — the channel customers already use
- **WazaBolt dashboard** — where the business manages conversations, customers and orders
- **Claude (Anthropic API)** — the AI assistant, called server-side only
- **Supabase / PostgreSQL** — data

## Getting started

```bash
npm install
cp .env.example .env.local   # nothing is required yet for the marketing site
npm run dev                  # http://localhost:3000
```

Checks: `npm run lint` and `npm run build`.

## Stack

Next.js 16 (App Router, TypeScript) · Tailwind CSS v4 · shadcn/ui-style components on Radix
(`components/ui`) · Lucide icons · Zod / React Hook Form (installed for Phase 2+).

## Project structure

```text
app/
  (marketing)/        /, /product, /features, /solutions, /pricing, /resources, /faq, /about, ...
  (auth)/             /login, /register (placeholders until Phase 2)
  icon.svg, apple-icon.png, opengraph-image.tsx, twitter-image.tsx
  manifest.ts, robots.ts, sitemap.ts
components/
  brand/              Logo, LogoMark, ChannelBadge
  marketing/          homepage and page sections
  conversations/      conversation UI primitives (shared with the future dashboard)
  motion/             Reveal (scroll reveal), CountUp
  ui/                 button, badge, card, accordion, sheet
config/               site (name, tagline, nav), plans, solutions, FAQ
lib/brand/            static SVG of the mark + brand hex values (icons, OG image)
public/logo/          exported logo files
assets/fonts/         Sora subset used only by the OG image generator
```

Old routes `/how-it-works` and `/industries` redirect permanently to `/product` and `/solutions`.

## Brand system

All tokens live in `app/globals.css`.

| Token | Hex | Use |
| --- | --- | --- |
| `bolt-500` (`--brand-primary`) | `#FFB020` | Bolt Amber — primary buttons, highlights (always with Ink text) |
| `ember-500` (`--brand-secondary`) | `#F2551D` | Ember Orange — accents; `ember-600/700` for text |
| `volt-500` (`--brand-accent`) | `#4B3FD1` | Volt Indigo — secondary accent |
| `ink` (`--brand-dark`) | `#15120E` | Near-black — text, dark sections |
| `sand` (`--brand-background`) | `#FAF7F0` | Warm off-white background |
| `stone` | `#5F574C` | Secondary text |

There is deliberately no green brand colour, so WazaBolt never reads as WhatsApp. `success`
green is used only for status badges such as "Delivered".

The `chat-*` colours (WhatsApp-style chat header, bubbles and wallpaper) exist only to depict
what a customer sees in their WhatsApp chat in the hero example. Never use them for WazaBolt UI.

**Typography:** Sora (display/headings, 600–800) and Inter (body/UI). Use the type utilities
`type-display`, `type-h1`, `type-h2`, `type-h3`, `type-lead`, `type-body`, `type-small` and
`type-label`.

**Logo:** a sharp, forward-leaning "W" struck through the centre by a lightning bolt, on an Ink
tile. Files: `public/logo/wazabolt-mark.svg` (tile), `wazabolt-mark-glyph.svg` (no tile, for dark
backgrounds), `wazabolt-logo-light.svg` / `wazabolt-logo-dark.svg` (horizontal lockups) and PNG
app icons.

**Tagline:** "Power your business on WhatsApp." — the single primary tagline (`siteConfig.tagline`).

## Status

| Area | Status |
| --- | --- |
| Marketing site, brand system, logo, SEO/OG/manifest, responsive layout | **Functional** (static pages) |
| Hero flow, live demo, dashboard preview | **UI mockup** — scripted example data |
| Pricing | **Functional display** from `config/plans.ts` (proposed prices) |
| Appointments, Broadcasts | Shown as **Coming soon** — not in the first release |
| Auth: register, email confirmation, login, logout, password reset, protected dashboard | **Functional** (Phase 2) |
| Database: users, businesses, business_members, audit_logs with RLS | **Functional** (Phase 2) |
| Dashboard shell: overview, settings, change password | **Functional**; other sections show "Soon" |
| Onboarding, catalog, WhatsApp webhook, AI, orders, billing | **Not started** — Phases 3–8 |

## Supabase setup (Phase 2)

1. **Create a Supabase project** and copy the Project URL and anon (public) key into
   `.env.local` (and your host's environment): `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `NEXT_PUBLIC_SITE_URL` (your site's public URL).
   The service-role key is not needed yet — never expose it to the browser.
2. **Apply the migration** in `supabase/migrations/` — paste it into the SQL editor, or run
   `npx supabase link` then `npx supabase db push`.
3. **Auth → URL configuration:** Site URL = your `NEXT_PUBLIC_SITE_URL`; add
   `<site-url>/auth/confirm` (or `<site-url>/**`) to Redirect URLs.
4. **Auth → Providers → Email:** keep "Confirm email" on.
5. **Auth → Email templates:** paste `supabase/templates/confirmation.html` into
   "Confirm signup" (subject: *Confirm your WazaBolt account*) and `recovery.html` into
   "Reset password" (subject: *Reset your WazaBolt password*). These links use
   `token_hash`, so they work even if the email is opened on a different device.
6. **Auth → SMTP:** set up a real email provider (e.g. Resend, Postmark). Supabase's built-in
   email is heavily rate-limited and meant for testing only.

Supabase Auth applies its own rate limits to sign-ups, logins and emails (configurable under
Auth → Rate limits). Consider enabling CAPTCHA protection before public launch.

### How auth works

- `proxy.ts` (Next.js 16's replacement for middleware) refreshes the session cookie on each
  request and redirects signed-out visitors away from `/dashboard`.
- `lib/auth/dal.ts` re-checks the user on the server for every protected page and action;
  the database enforces tenant isolation with Row Level Security.
- Session cookies are `httpOnly`, `SameSite=Lax` and `Secure` in production. Only server code
  talks to Supabase.
- Sign-up creates the user profile, their business (from the business name entered) and an
  owner membership in one database trigger, and writes an audit log entry.
- Forms validate in the browser (React Hook Form + Zod) and again in Server Actions.

### Tests

```bash
# Database: tenant isolation / RLS (against a local or staging DB — never production)
DATABASE_URL=postgres://... npm run test:db

# End-to-end: needs Supabase Auth + DB + Mailpit, e.g. `npx supabase start`,
# then `npm run build && npm start` with the local Supabase URL/key in .env.local
NEXT_PUBLIC_SUPABASE_ANON_KEY=... npm run test:e2e
```

## Before launch

- Replace `public/images/hero-owner.webp` and `product-robe-wax.webp` (low-resolution crops from
  the design mockup) with licensed, high-resolution photos.
- The horizontal logo SVGs use live Sora text; outline the text in a design tool for print.
- Contact, Privacy and Terms pages are placeholders (sign-up links to Terms and Privacy).
- Set `NEXT_PUBLIC_SITE_URL` in production so canonical URLs, the sitemap and OG links are correct.
