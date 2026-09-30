# WazaBolt

**WazaBolt — Your AI Business Assistant on WhatsApp.** Power your business on WhatsApp. Never miss
a customer. WazaBolt is a WhatsApp business automation platform for African businesses, starting in
Cameroon. Businesses connect their business WhatsApp account to
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

Checks: `npm run lint`, `npm test` (unit tests) and `npm run build`.

## Stack

Next.js 16 (App Router, TypeScript) · Tailwind CSS v4 · shadcn/ui-style components on Radix
(`components/ui`) · Lucide icons · Zod / React Hook Form (installed for Phase 2+).

## Project structure

```text
app/
  [lang]/             root layout (html lang), every page lives under /en or /fr
    (marketing)/      /, /features, /how-it-works, /pricing, /solutions, /faq, /resources, /about, ...
    (auth)/           /login, /register, /forgot-password, /reset-password
    dashboard/        protected SaaS dashboard: home, onboarding, conversations, customers,
                      products, orders, knowledge, ai (+ ai/languages), automations,
                      analytics, whatsapp, team, billing, settings
    opengraph-image   localized link-preview image
  auth/confirm/       email-link handler (not localized)
  brand-assets/       internal: generated social templates (/brand-assets/*.png, not linked)
  global-not-found.tsx, icon.svg, apple-icon.png, manifest.ts, robots.ts, sitemap.ts
messages/             UI dictionaries: en.ts (source of truth), fr.ts
lib/i18n/             locales, language registry, country packs, routing helpers, dictionaries
lib/ai/               WhatsApp AI language layer: packs, detection, resolution, prompts, reply schema;
                      service.ts (generateResponse, validateAIResponse…), context.ts, tools/registry.ts
lib/actions/          Server Actions (auth, settings, business, products, knowledge, customers,
                      conversations, orders, ai) — all re-check the user's role
lib/data/queries.ts   dashboard read models (always RLS-scoped to the user's business)
lib/validation/       Zod schemas shared by forms and Server Actions
lib/whatsapp/         Cloud API client (graph.ts), token encryption, connect/disconnect, webhook ingestion
app/api/whatsapp/     webhook endpoint (GET verification, POST messages + statuses)
types/supabase.ts     generated database types (`npm run db:types`)
components/
  brand/              WazaBoltLogo, WazaBoltIcon, WazaBoltBadge, AIStatus, ChannelBadge
  marketing/          sections + FeatureCard, IndustryCard, PricingCard, SectionHeading, CTASection,
                      DashboardPreview (dashboard-mock.tsx)
  conversations/      WhatsAppChatMockup (customer's view, demo) and dashboard chat primitives
  dashboard/          sidebar, mobile nav, user card, language settings form
  app/                dashboard building blocks: page header, panels, empty states, stat cards,
                      badges, tables, action forms (useActionState), product/customer/order forms
  motion/             Reveal (scroll reveal), CountUp
  ui/                 Button (the WazaBolt button: default/outline/secondary/ghost/dark/gold variants),
                      badge, card, accordion, sheet, input, label
config/               site (name, taglines, nav), plans, solutions, FAQ, dashboard nav
lib/brand/            mark SVG + brand hex (icons), icon tones, social image generator
public/logo/          exported logo files (icon, horizontal, compact, dark, mono, PNG sizes)
assets/               Plus Jakarta Sans subset + JPEG photos used only by the image generator
```

`/product` and `/industries` redirect permanently to `/how-it-works` and `/solutions`.

## Brand system

Tokens live in `app/globals.css` (`@theme` scales plus `--brand-*` variables). The brand
styleboard is an internal design reference: it is applied through these tokens and the logo
components, and is not shown as a page on the public site.

| Colour | Hex | Token | Use |
| --- | --- | --- | --- |
| Waza Green | `#16B878` | `waza-500` / `--brand-primary` | Primary buttons, links, active states, AI indicators |
| Deep Teal | `#102A2A` | `deep` / `--brand-secondary` | Headings, navigation, dark sections, footer, logo text |
| Golden | `#FFC83D` | `gold` / `--brand-accent` | The bolt, badges, small accents |
| Coral | `#FF6B4A` | `coral-500` / `--brand-alert` | Alerts and rare highlights only |
| Soft Mint | `#E9FAF3` | `mint` / `waza-50` | Section backgrounds, subtle cards |
| Warm White | `#FFFDF8` | `cream` / `--brand-background` | Page background |
| Slate | `#526262` | `slate` / `--brand-text-muted` | Secondary text |

**Accessibility rules:** Waza Green buttons carry Deep Teal text (5.9:1 — white would be 2.6:1).
Green headline text uses `waza-600` (#12A06A, large text); green body text and links use
`waza-700` (#0C8354). Gold always carries Deep Teal text.

**Typography:** Plus Jakarta Sans (headings, 600–800) + Inter (body, 400–600) via `next/font`.
Type utilities: `type-display`, `type-h1`, `type-h2`, `type-h3`, `type-lead`, `type-body`,
`type-small`, `type-label`.

**Logo:** a rounded conversation bubble with a bold white "W" and a Golden lightning bolt breaking
through its top-right corner. Variants: horizontal (with tagline), compact (stacked), icon only,
dark background, monochrome. Favicon and the WhatsApp profile image use the icon only.

**Messages:** descriptor "Your AI Business Assistant on WhatsApp." · primary "Power your business
on WhatsApp." · supporting "Never miss a customer." (all in `config/site.ts`).

**Design rules:** moderately rounded cards (`rounded-2xl`), soft shadows, subtle borders, generous
spacing, green actions, gold accents, one Deep Teal contrast section per page, Lucide icons only,
restrained motion (disabled under reduced motion). Unbuilt features are always labelled
**Coming Soon / Planned**.

The `chat-*` colours exist only to depict a customer's WhatsApp chat in demo mockups. WazaBolt is
not affiliated with WhatsApp or Meta, and the WhatsApp logo itself is never used.

## Status

| Area | Status |
| --- | --- |
| Marketing site, brand system, logo, SEO/OG/manifest, responsive layout | **Functional** (static pages) |
| Hero chat, live demo, dashboard preview | **UI mockup** — demo conversation / example data |
| Pricing | **Functional display** from `config/plans.ts` (proposed prices) |
| Appointments, Broadcasts, Mobile Money | Shown as **Planned** — not in the first release |
| Auth: register, email confirmation, login, logout, password reset, protected dashboard | **Functional** (Phase 2) |
| Database: users, businesses, business_members, audit_logs with RLS | **Functional** (Phase 2) |
| Dashboard (Stage 1): home with real metrics, 6-step onboarding, products (variants, images, stock), knowledge (FAQs + documents), customers, conversations (Take Over / Return to AI), orders, AI settings, analytics, WhatsApp status, team, billing, settings | **Functional** — real data only; empty states say "No data yet" |
| Roles owner / admin / agent / viewer | **Enforced** in Server Actions and by RLS |
| Website + dashboard in English and French (URLs, metadata, hreflang, sitemap, emails) | **Functional** |
| Languages & AI style settings (reply languages, default, mode, tone, formality, emoji, length, notes) | **Functional** — saved to the database |
| Language detection / resolution / prompt builder (en, fr, Cameroonian Pidgin) | **Functional code + unit tests**; not yet called by a live AI (no WhatsApp webhook yet) |
| WhatsApp (Stage 2): connect a number (verified with Meta, token encrypted), webhook (signature-checked, idempotent), customers + conversations created automatically, team replies from the inbox, delivery ticks, read receipts, 24-hour window, media stored privately | **Functional** — see "WhatsApp setup" below |
| AI replies (Anthropic), voice transcription, image understanding, templates, payments, broadcasts, invites | **Not started** — interfaces only (`lib/ai/service.ts`, `lib/ai/tools`, `lib/messaging/ports.ts`) |

## Multilingual architecture

WazaBolt is multilingual from the start, on three layers:

**1. UI (website, auth, dashboard) — English and French.** Every page lives under `/en` or `/fr`
(`app/[lang]`). `proxy.ts` sends unprefixed URLs to the visitor's saved choice (`NEXT_LOCALE`
cookie), else their browser language, else English. Strings live in `messages/en.ts` (source of
truth) and `messages/fr.ts`; TypeScript fails the build if a key is missing. Server Components use
`getMessages()`; Client Components use `useI18n()`. Validation and auth errors are keys, translated
by the form. Pages have localized titles, canonical + `hreflang` alternates, and the sitemap lists
both languages. Signed-in users' dashboard language is stored in `users.ui_locale` and in their auth
metadata, which the bilingual email templates read (`.Data.locale`).

**2. Data — languages are rows, not columns.** `languages` (BCP-47 codes; Cameroonian Pidgin is
`wes`), `country_packs` + `country_pack_languages` (Cameroon: XAF, Africa/Douala, en/fr/wes),
`business_languages` + `businesses.default_language`, `ai_settings` (language mode and response
style), and per-customer `preferred_language` with its source (`explicit_request`,
`set_by_business`, `inferred`). Messages record detected language, confidence, secondary language
and whether the message was mixed. Sign-up applies the country pack automatically.

**3. WhatsApp AI (`lib/ai/`).** For every inbound message:
`detect.ts` scores each supported language (handles mixing, missing accents, SMS spelling, Pidgin's
English vocabulary) → `explicit-request.ts` catches "reply in English" / "en français svp" /
"you fit tok Pidgin?" (negations ignored) → `resolve.ts` picks the reply language
(business fixed mode > explicit request > saved preference > confident detection > conversation
language > default; disabled languages fall back, Pidgin → English) → `prompts/system-prompt.ts`
builds a cache-friendly prompt (platform rules + one guide per language, then the business's
languages and style, then a per-turn language decision) → `reply-schema.ts` defines the structured
reply the model must return, including the language it used.

**Adding a language or country:** add it to `lib/i18n/languages.ts` and the `languages` table, write
an AI pack in `lib/ai/language/packs/` (detection words, request names, prompt guidance, formality
rules, fixed messages), and list it in a country pack. For a new dashboard language, add a
dictionary in `messages/` and register it in `lib/i18n/config.ts` and `lib/i18n/load.ts`.

**Before launch:** the French UI copy and the French/Pidgin fixed messages and prompt guidance
(`lib/ai/language/packs/fr.ts`, `wes.ts`, marked `needs-review`) should be reviewed by fluent
speakers. Pidgin is labelled Beta in the dashboard.

## Multimodal messages (text, voice, images)

Every WhatsApp message is stored with a `message_type`: `text`, `image`, `audio`, `document`,
`video` or `location` (migration `20260930120000_multimodal_messages.sql`).

| Type | MVP status | What happens |
| --- | --- | --- |
| Text | **Processed** | Language pipeline → AI reply |
| Voice note (audio) | **Architecture ready** | Stored privately; customer gets a polite "please type" reply in their language; team notified. Switch on once a speech-to-text provider is chosen (`Transcriber` in `lib/messaging/ports.ts`). |
| Image | **Architecture ready** | Stored privately; customer told the team will look; team notified. Switch on with the catalog (Phase 3): image + caption go to the vision model with the `search_catalog` tool. |
| Document, video, location | Stored, not processed | Team notified; shown in the dashboard. |

- **Pipeline:** `lib/messaging/whatsapp/webhook.ts` (verify `X-Hub-Signature-256`, parse all types) →
  `plan.ts` (what to do per type, from `capabilities.ts`) → `whatsapp/media-downloader.ts` (Cloud API,
  server token, type/size/checksum checks) → `media-store.ts` (private bucket) → transcription /
  vision → `ai-input.ts` (the customer turn the model sees).
- **Voice:** transcripts live in `message_transcriptions`, separate from the audio file, with their
  own detected language (English, French, Pidgin). The dashboard shows the player and the
  transcript side by side (`components/conversations/message-content.tsx`).
- **Images:** the prompt forbids prices, stock or product details from appearance alone. The model
  must call `search_catalog`; `decideCatalogMatch()` only lets a single clear, confident match be
  quoted, otherwise the assistant asks which product or hands over. Results are recorded in
  `message_image_analyses`.
- **Security:** WhatsApp and service-role credentials are server-only. Media sits in the private
  Storage bucket `whatsapp-media` (created by the migration, no public access, no browser
  policies); the dashboard gets 5-minute signed URLs after a Row Level Security membership check.
  Storage paths are built from ids, never filenames. Logs record ids and error codes, never media
  or message content. Media is marked for deletion after 90 days by default (`delete_after`);
  transcripts and analyses remain.
- **Choosing speech-to-text:** test candidates on real Cameroonian voice notes in English, French
  and Pidgin before switching audio on — Pidgin support in commercial engines is limited.

## Supabase setup (Phase 2)

1. **Create a Supabase project** and copy the Project URL and anon (public) key into
   `.env.local` (and your host's environment): `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `NEXT_PUBLIC_SITE_URL` (your site's public URL).
   The service-role key is only needed for webhooks/media later — never expose it to the browser.
2. **Apply the migrations** in `supabase/migrations/`, in filename order — paste each into the SQL
   editor, or run `npx supabase link` then `npx supabase db push`.
3. **Auth → URL configuration:** Site URL = your `NEXT_PUBLIC_SITE_URL`; add
   `<site-url>/auth/confirm` (or `<site-url>/**`) to Redirect URLs.
4. **Auth → Providers → Email:** keep "Confirm email" on.
   Storage buckets `whatsapp-media` (private) and `product-images` (public read, owner/admin
   upload into their own business folder) are created by the migrations — check they exist under
   Storage after applying them.
5. **Auth → Email templates:** paste `supabase/templates/confirmation.html` into
   "Confirm signup" (subject: *Confirm your WazaBolt account / Confirmez votre compte WazaBolt*) and
   `recovery.html` into "Reset password" (subject: *Reset your WazaBolt password / Réinitialisez
   votre mot de passe WazaBolt*). The body switches between English and French from the user's
   locale. These links use `token_hash`, so they work even if the email is opened on a different
   device.
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
# Unit tests: language detection, explicit requests, reply-language resolution, prompts
npm test

# Database: tenant isolation, RLS, multilingual, multimodal and SaaS-foundation schema
# (local or staging DB — never production)
DATABASE_URL=postgres://... npm run test:db

# End-to-end: needs Supabase Auth + DB + Mailpit, e.g. `npx supabase start`,
# then `npm run build && npm start` with the local Supabase URL/key in .env.local
NEXT_PUBLIC_SUPABASE_ANON_KEY=... npm run test:e2e
# Stage 1 dashboard: onboarding, CRUD, takeover, orders, tenant isolation, mobile layout
NEXT_PUBLIC_SUPABASE_ANON_KEY=... npm run test:e2e:dashboard
# Stage 2 WhatsApp, against a local fake Graph API (tests/e2e/fake-graph.mjs, port 4010).
# Start the app with WHATSAPP_GRAPH_API_BASE_URL=http://localhost:4010 and test values for
# WHATSAPP_APP_SECRET / WHATSAPP_VERIFY_TOKEN / WHATSAPP_TOKEN_ENCRYPTION_KEY / SUPABASE_SERVICE_ROLE_KEY.
NEXT_PUBLIC_SUPABASE_ANON_KEY=... WHATSAPP_APP_SECRET=... WHATSAPP_VERIFY_TOKEN=... npm run test:e2e:whatsapp

# Regenerate database types after a migration
DATABASE_URL=postgres://... npm run db:types
```

## WhatsApp setup (Stage 2)

WazaBolt uses Meta's official WhatsApp Business Platform (Cloud API) with **one Meta app for the
platform**; each business connects its own number.

1. **Apply** `supabase/migrations/20261002120000_whatsapp_integration.sql` (after the earlier ones).
2. **Server environment** (Vercel → Settings → Environment Variables; never `NEXT_PUBLIC_`):
   `SUPABASE_SERVICE_ROLE_KEY`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`,
   `WHATSAPP_TOKEN_ENCRYPTION_KEY` (`openssl rand -base64 32`). Redeploy.
3. **Meta app** (developers.facebook.com → your app → WhatsApp → Configuration):
   callback URL `https://<your-site>/api/whatsapp/webhook`, verify token = `WHATSAPP_VERIFY_TOKEN`,
   then subscribe to the **messages** webhook field. The app must be in Live mode for real customers.
4. **Each business** (Dashboard → WhatsApp, owner/admin): Phone Number ID, WhatsApp Business Account
   ID and a permanent System User access token with `whatsapp_business_messaging` and
   `whatsapp_business_management`, issued for the platform's Meta app. WazaBolt checks the number
   belongs to the account, reads its display name, subscribes the app to the account's webhooks,
   and only then shows **Connected**. The token is encrypted (AES-256-GCM) before it is stored in
   `whatsapp_credentials`, a table no browser role can read.

How it behaves:

- Incoming messages create/update the customer (WhatsApp profile name, first/last contact,
  detected language), continue their latest conversation (a resolved one is reopened) and count as
  unread. Meta retries are stored once. Media is downloaded after the webhook responds, into the
  private `whatsapp-media` bucket (signed URLs, 90-day retention).
- The team replies from Conversations. Replying switches the conversation to Human Mode. WhatsApp
  only allows free-form replies within 24 hours of the customer's last message; after that the
  composer explains why it's closed (template messages are not built yet).
- Delivery receipts update the ticks (Sent → Delivered → Read, or Not delivered with Meta's error
  code); opening a conversation sends a read receipt. The inbox refreshes every few seconds.
- Nobody answers automatically yet: text messages are stored with `processing_status = received`
  for the AI stage to pick up.
- Meta's **Embedded Signup** (self-serve "Continue with Facebook") needs Tech Provider approval
  and is a later step; until then numbers are connected with the IDs + token above.

## Before launch

- Replace `public/images/hero-owner.webp` and `product-robe-wax.webp` (low-resolution crops from
  the design mockup) with licensed, high-resolution photos — and the JPEG copies in `assets/`
  used by the social image generator (the Instagram story shows the low resolution most).
- The horizontal/compact logo SVGs use live Plus Jakarta Sans text; outline the text in a design
  tool before print use.
- Contact, Privacy and Terms pages are placeholders (sign-up links to Terms and Privacy).
- Set `NEXT_PUBLIC_SITE_URL` in production so canonical URLs, the sitemap and OG links are correct.
