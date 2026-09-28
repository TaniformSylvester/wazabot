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
| Login / Register | **Placeholder** — Phase 2 |
| Dashboard, database, WhatsApp webhook, AI, orders, billing | **Not started** — Phases 2–8 |

## Before launch

- Replace `public/images/hero-owner.webp` and `product-robe-wax.webp` (low-resolution crops from
  the design mockup) with licensed, high-resolution photos.
- The horizontal logo SVGs use live Sora text; outline the text in a design tool for print.
- Contact, Privacy and Terms pages are placeholders.
- Set `NEXT_PUBLIC_SITE_URL` in production so canonical URLs, the sitemap and OG links are correct.
