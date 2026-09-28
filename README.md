# WazaBot

**Your AI Receptionist on WhatsApp.** A Cameroon-first SaaS that gives businesses an AI
receptionist and sales assistant working through the official WhatsApp Business Platform.

- **WhatsApp** — where the AI employee works
- **WazaBot dashboard** — where the business owner manages it
- **Claude (Anthropic API)** — the AI brain, called server-side only
- **Supabase / PostgreSQL** — data and memory

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
Supabase, Recharts and the Anthropic SDK are added in the phases that need them.

> `components/ui` follows the shadcn/ui conventions (`components.json` is configured), so
> `npx shadcn add <component>` works when the registry is reachable.

## Project structure

```text
app/
  (marketing)/        public site: /, /features, /how-it-works, /pricing, /industries, /faq, ...
  (auth)/             /login, /register (placeholders until Phase 2)
  icon.svg            favicon (the WazaBot mark)
components/
  brand/              Logo, LogoMark, WhatsAppIcon
  marketing/          homepage sections
  conversations/      WhatsApp-style chat primitives (shared with the future dashboard)
  ui/                 button, badge, card, accordion, sheet
config/               site nav, plans (pricing), industries, FAQ
lib/                  utilities
public/images, logo/  hero photo, product thumbnail, logo exports
```

## Design system

Defined in `app/globals.css` (`@theme`). Brand colours: Waza Green `#16B878`, Deep Waza
`#102A2A`, Golden Energy `#FFC83D`, Coral `#FF6B4A`, Soft Mint `#E9FAF3`, Warm White `#FFFDF8`,
Slate `#526262`. Headings use Plus Jakarta Sans (600–800), body uses Inter (400–600).

Brand green on white is only 2.6:1 contrast, so text and button fills use the darker
`waza-600` / `waza-700` shades; `waza-500` (the brand green) is used for fills, icons and
illustration.

## Status

| Area | Status |
| --- | --- |
| Marketing site, design system, logo, responsive layout | **Functional** (static pages) |
| Hero chat, WhatsApp demo, dashboard preview | **UI mockup** — scripted example data |
| Pricing | **Functional display** from `config/plans.ts` (proposed prices, not final) |
| Login / Register | **Placeholder** — Phase 2 |
| Dashboard, database, WhatsApp webhook, AI, orders, billing | **Not started** — Phases 2–8 |

## Assets to replace before launch

- `public/images/hero-owner.webp` and `public/images/product-robe-wax.webp` are cropped
  from the design mockup at low resolution. Replace them with licensed, high-resolution photos.
- About, Contact, Privacy and Terms pages are "being written" placeholders.
