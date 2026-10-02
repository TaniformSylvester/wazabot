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
lib/ai/               WhatsApp AI: language layer (packs, detection, resolution), prompts, reply schema,
                      claude.ts (Claude tool loop), pipeline.ts (when/how to answer), context.ts,
                      service.ts (validation), tools/registry.ts (business-scoped tools)
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
| Broadcasts, Mobile Money, voice notes | Shown as **Planned** — not in the first release |
| Auth: register, email confirmation, login, logout, password reset, protected dashboard | **Functional** (Phase 2) |
| Database: users, businesses, business_members, audit_logs with RLS | **Functional** (Phase 2) |
| Dashboard (Stage 1): home with real metrics, 6-step onboarding, products (variants, images, stock), knowledge (FAQs + documents), customers, conversations (Take Over / Return to AI), orders, AI settings, analytics, WhatsApp status, team, billing, settings | **Functional** — real data only; empty states say "No data yet" |
| Roles owner / admin / agent / viewer | **Enforced** in Server Actions and by RLS |
| Website + dashboard in English and French (URLs, metadata, hreflang, sitemap, emails) | **Functional** |
| Languages & AI style settings (reply languages, default, mode, tone, formality, emoji, length, notes) | **Functional** — saved to the database |
| Language detection / resolution / prompt builder (en, fr, Cameroonian Pidgin) | **Functional code + unit tests**; not yet called by a live AI (no WhatsApp webhook yet) |
| WhatsApp (Stage 2): connect a number (verified with Meta, token encrypted), webhook (signature-checked, idempotent), customers + conversations created automatically, team replies from the inbox, delivery ticks, read receipts, 24-hour window, media stored privately | **Functional** — see "WhatsApp setup" below |
| AI replies (Stage 3): Claude answers WhatsApp customers from the catalog, FAQs, policies and hours; looks up products/stock, records orders, hands over to the team; respects Human Mode, after-hours settings and the plan's monthly allowance; usage logged | **Functional** — needs `ANTHROPIC_API_KEY`; see "AI replies" below |
| Business operations (Stage 4): orders take stock automatically (back on cancel/delete, never oversold — the AI included), low-stock alerts; team invitation links, roles, removing/leaving, switching businesses; AI-allowance warnings at 80 % / 100 %; plan-change requests approved by the WazaBolt team | **Functional** — see "Business operations" below |
| Product photos (Stage 5): customers' photos on WhatsApp (and in the test chat) are looked at by the assistant and matched to the catalog, comparing with the catalog's own product photos | **Functional** — see "AI replies" below |
| Appointments (Stage 6): services with duration and price, bookable in opening hours (slot step, capacity, notice, horizon); the assistant finds free times and books on WhatsApp; Calendar with confirm / done / no-show / cancel; booking from the dashboard | **Functional** — see "Appointments" below |
| Customer notifications (Stage 7): order updates, appointment confirmations / cancellations / reminders, follow-up after 24 h; WazaBolt's message templates submitted to Meta with review status | **Functional** — see "Customer notifications" below; goes out once WhatsApp is connected |
| Voice transcription, payments, broadcasts | **Not started** — interfaces only (`lib/messaging/ports.ts`); voice notes get a short notice and are flagged for the team |

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
| Image | **Processed** (Stage 5) | Stored privately, then shown to the assistant with its caption; it searches the catalog and compares with product photos (`viewProductPhotos`). If the photo can't be opened, the customer gets a short notice and the team is flagged. |
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

# Database: tenant isolation, RLS, multilingual, multimodal, SaaS foundation, WhatsApp, AI and
# business-operations schema
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
# Stage 3 AI replies, against a scripted fake Anthropic API (tests/e2e/fake-anthropic.mjs, port 4020).
# Start the app with ANTHROPIC_API_KEY=test-key ANTHROPIC_BASE_URL=http://localhost:4020 AI_DEBOUNCE_MS=1500 too.
# The photo checks need Supabase Storage (included in `npx supabase start`).
NEXT_PUBLIC_SUPABASE_ANON_KEY=... WHATSAPP_APP_SECRET=... npm run test:e2e:ai
# Stage 6 appointments (fake Graph + fake Anthropic, like the AI suite)
NEXT_PUBLIC_SUPABASE_ANON_KEY=... DATABASE_URL=postgres://... WHATSAPP_APP_SECRET=... npm run test:e2e:appointments
# Stage 7 notifications (fake Graph with templates); start the app with CRON_SECRET=test-cron too
NEXT_PUBLIC_SUPABASE_ANON_KEY=... DATABASE_URL=postgres://... WHATSAPP_APP_SECRET=... npm run test:e2e:notifications
# Stage 4 business operations (stock, usage banner, plan requests, invitations, roles).
# Uses DATABASE_URL directly to play the WazaBolt operator (approving a plan) and simulate AI usage.
NEXT_PUBLIC_SUPABASE_ANON_KEY=... DATABASE_URL=postgres://... npm run test:e2e:operations

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

## AI replies (Stage 3)

When a customer writes, the webhook stores the message and answers after responding to Meta
(`lib/ai/pipeline.ts`):

1. Waits briefly (`AI_DEBOUNCE_MS`, default 3 s) so a burst of messages gets one answer, to the newest.
2. Stays silent if AI is switched off for the business, the conversation is in **Human Mode**, the
   24-hour window is closed, or WhatsApp isn't connected.
3. Over the plan's monthly AI-conversation allowance, a new conversation is flagged for the team instead.
4. Outside opening hours, follows the AI Assistant setting: answer normally, send the owner's
   after-hours message (once per 12 h), or hand over.
5. Photos go to the model with their caption (`lib/ai/images.ts`: decoded and re-encoded as JPEG,
   at most 1024 px, before anything is sent). It searches the catalog with words describing the photo
   and can look at up to 2 catalog photos (`viewProductPhotos`, 512 px thumbnails, only images from
   WazaBolt's own `product-images` storage) before saying "we have it". Image tokens grow with
   pixels, so a photo message costs about as much as one or two text messages. Businesses can switch
   photo understanding off (AI Assistant → "Understand customer photos", migration
   `20261006120000_photo_setting.sql`): photos are then passed to the team with a short notice. It never confirms a payment from a
   screenshot. Voice notes and files get a short notice in the customer's language and are flagged
   for the team.
6. Otherwise: detects the language (English / French / Cameroonian Pidgin, mixed), picks the reply
   language, and asks Claude (`lib/ai/claude.ts`). The model uses tools scoped to the business —
   searchProducts, viewProductPhotos, checkProductStock, getBusinessHours, getDeliveryFee, getOrderStatus, createOrder,
   createCustomer, requestHumanAgent — and finishes with `send_reply` (structured reply).
7. The reply is checked before sending: it may only quote products the tools returned, must not be
   empty or too long; otherwise a handoff notice is sent instead. `needs_human` switches the
   conversation to Human Mode and flags it.
8. Every attempt is logged in `ai_usage` (model, tokens, tool calls, outcome — never content), shown on
   the AI Assistant page.

**Test chat** (AI Assistant → Test chat, agents and above): talk to the assistant as a customer
without WhatsApp, including sending a product photo. Same prompt, knowledge, tools and language rules; catalog lookups are real, but
orders, customer details and handovers are simulated (`dryRun`), nothing is sent and the transcript
stays in the browser. Limited to 40 messages per business per hour; runs are logged in `ai_usage`
with reason `test_chat` and left out of the monthly figures.

Model: `claude-opus-5-5` at `low` effort by default (`AI_MODEL`, `AI_EFFORT`), prompt caching on the
platform rules + business knowledge, and Anthropic's server-side fallback for safety declines. Set
`ANTHROPIC_API_KEY` in Vercel (server-side only) and redeploy; the AI Assistant page shows **Live**
once the key is set, WhatsApp is connected and AI is switched on.

## Business operations (Stage 4)

Apply `supabase/migrations/20261005120000_business_operations.sql` (after the earlier ones).

**Stock.** Orders created from now on take their items out of stock — the variant's stock when the
variant tracks it, otherwise the product's (empty stock = not tracked, never touched). An order for
more than is in stock is refused with the item's name, from the dashboard and from the AI assistant
(which then tells the customer what's available). Cancelling an order gives the stock back; deleting
one that still holds stock too; un-cancelling takes it again (refused if it's been sold meanwhile).
Each product has a **low-stock alert** level (default 5): the dashboard home lists products and
variants at or below it, and Products → Stock "Low" filters by each product's own level. Orders
created before this migration never took stock, so cancelling them doesn't add any.

**Team.** Owners and admins invite people from **Team**: enter their email and role, then share the
link (copy, or "Share on WhatsApp") — WazaBolt doesn't email it. The link works once, for that
email only, for 7 days; only its hash is stored, so it's shown once ("New link" makes a fresh one and
the old one stops working). A new person creates their account from the link (no business of their
own); someone who already has a WazaBolt account logs in and clicks **Join**, then switches between
businesses from the name at the top of the dashboard. Admins manage agents and viewers; only the
owner invites or manages admins; the owner can't be removed. Anyone else can leave a business.

**AI allowance.** `ai_usage_status()` counts the conversations the assistant answered in since the
1st of the month (UTC) against the plan; the AI pipeline, the billing page and the dashboard banner
all use it. Owners and admins see a warning from 80 % and a notice once it's used up (conversations
already answered this month continue; new ones go to the team).

**Plan changes (no payments yet).** On **Billing**, an owner or admin requests a plan with a phone
number to reach them. The request is logged on the server (`[billing.planRequest] …` in the Vercel
logs) and listed in the `plan_change_requests` table. Arrange payment (e.g. Mobile Money), then in the
Supabase SQL editor:

```sql
-- pending requests
select r.id, b.name, r.from_plan_id, r.to_plan_id, r.contact_phone, r.note, r.created_at
from plan_change_requests r join businesses b on b.id = r.business_id
where r.status = 'pending' order by r.created_at;

select public.approve_plan_change('<request id>');  -- switches the plan, new one-month period from now
select public.reject_plan_change('<request id>');
```

## Appointments (Stage 6)

Apply `supabase/migrations/20261007120000_appointments.sql`. Then, in **Appointments → Services &
settings**, switch on **Take bookings**, set the start-time step, how many appointments can happen
at once (chairs/staff), the minimum notice and how far ahead, and add services (duration, price or
"price on request"). Bookable hours are the business's opening hours, in its timezone.

- `available_slots()` lists free start times; `book_appointment()` books under a per-business lock
  and re-checks the slot, so the team and the assistant can never take the same last place.
- The assistant gets the services in its (cached) business information and four tools —
  findAvailableSlots, bookAppointment, getMyAppointments, cancelAppointment — only when booking is on.
  Times go to and from the model as local `YYYY-MM-DDTHH:mm` and are matched against real slots.
- **Calendar**: next 30 days (or the past 30) by day; confirm, cancel, mark done or no-show. Bookings
  made on WhatsApp are marked. "New appointment" (also from a customer's page) only offers free times.
- Reminders to customers on WhatsApp need approved template messages (not built yet).

## Customer notifications (Stage 7)

Apply `supabase/migrations/20261008120000_notifications.sql`.

- **What's sent** (WhatsApp → Notifications, on by default): order Confirmed / Ready / Out for
  delivery / Delivered (when the team changes the status), appointment booked / cancelled from the
  dashboard, and a reminder the evening before. Each event is sent once (`notifications.event_key`).
- **24-hour rule**: inside 24 h of the customer's last message a notification is a normal text;
  after that WhatsApp only accepts **approved templates**. "Submit templates to Meta" creates
  WazaBolt's 8 templates (English + French, category UTILITY) in the business's WhatsApp Business
  Account; "Refresh status" reads Meta's review. Until a template is approved, that notification is
  recorded as "not sent — template not approved yet" (and retried the next time).
- **Template review webhook**: in the Meta app (WhatsApp → Configuration → Webhook fields) also
  subscribe to `message_template_status_update` so approvals show up without refreshing.
- **Follow-up**: on a conversation past 24 h, "Send follow-up template" asks the customer to reply
  (once a day per conversation); when they do, the team can write freely again.
- **Reminders**: `vercel.json` runs `/api/cron/reminders` daily at 17:00 UTC (18:00 in Douala) for
  appointments starting in the next 2–30 hours. Set **`CRON_SECRET`** in Vercel (any long random
  string); Vercel sends it to the job, and calls without it are refused. On Vercel's Hobby plan cron
  jobs run once a day, which is what this needs.
- Notifications show in the customer's conversation (sender "System") and on the order page.

## Before launch

- Replace `public/images/hero-owner.webp` and `product-robe-wax.webp` (low-resolution crops from
  the design mockup) with licensed, high-resolution photos — and the JPEG copies in `assets/`
  used by the social image generator (the Instagram story shows the low resolution most).
- The horizontal/compact logo SVGs use live Plus Jakarta Sans text; outline the text in a design
  tool before print use.
- Contact, Privacy and Terms pages are placeholders (sign-up links to Terms and Privacy).
- Set `NEXT_PUBLIC_SITE_URL` in production so canonical URLs, the sitemap and OG links are correct.
