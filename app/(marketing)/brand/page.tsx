import type { Metadata } from "next";
import Image from "next/image";
import { Download } from "lucide-react";

import { AIStatus } from "@/components/brand/ai-status";
import { BRAND_TAGLINE, WazaBoltIcon, WazaBoltLogo } from "@/components/brand/logo";
import { WazaBoltBadge } from "@/components/brand/wazabolt-badge";
import { PageIntro } from "@/components/marketing/page-intro";
import { siteConfig } from "@/config/site";

export const metadata: Metadata = {
  title: "Brand kit",
  description: "WazaBolt logo system, colours, typography and social templates.",
  robots: { index: false },
};

const colors = [
  { name: "Waza Green", hex: "#16B878", use: "Primary actions, links, AI indicators", swatch: "bg-waza-500" },
  { name: "Deep Teal", hex: "#102A2A", use: "Headings, navigation, dark sections, logo text", swatch: "bg-deep" },
  { name: "Golden", hex: "#FFC83D", use: "The bolt, badges, small accents", swatch: "bg-gold" },
  { name: "Coral", hex: "#FF6B4A", use: "Alerts and rare highlights only", swatch: "bg-coral-500" },
  { name: "Soft Mint", hex: "#E9FAF3", use: "Section backgrounds, subtle cards", swatch: "bg-mint" },
  { name: "Warm White", hex: "#FFFDF8", use: "Main page background", swatch: "bg-cream" },
  { name: "Slate", hex: "#526262", use: "Secondary text, descriptions", swatch: "bg-slate" },
];

const downloads = [
  { label: "Icon (SVG)", href: "/logo/wazabolt-icon.svg" },
  { label: "Icon for dark backgrounds (SVG)", href: "/logo/wazabolt-icon-dark-bg.svg" },
  { label: "Icon — monochrome (SVG)", href: "/logo/wazabolt-icon-mono.svg" },
  { label: "Horizontal logo (SVG)", href: "/logo/wazabolt-logo-horizontal.svg" },
  { label: "Horizontal logo — dark (SVG)", href: "/logo/wazabolt-logo-horizontal-dark.svg" },
  { label: "Compact logo (SVG)", href: "/logo/wazabolt-logo-compact.svg" },
  { label: "App icon 512 (PNG)", href: "/logo/wazabolt-icon-512.png" },
  { label: "WhatsApp Business profile 640 (PNG)", href: "/logo/wazabolt-whatsapp-profile.png" },
];

const social = [
  { label: "Facebook cover · 1640×624", href: "/brand-assets/facebook-cover.png", w: 1640, h: 624 },
  { label: "Instagram post · 1080×1080", href: "/brand-assets/instagram-post.png", w: 1080, h: 1080 },
  { label: "Instagram story · 1080×1920", href: "/brand-assets/instagram-story.png", w: 1080, h: 1920 },
  { label: "Link preview (Open Graph) · 1200×630", href: "/opengraph-image", w: 1200, h: 630 },
];

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-white p-6 shadow-card sm:p-8">
      <h2 className="type-h3 text-xl">{title}</h2>
      <div className="mt-6">{children}</div>
    </section>
  );
}

export default function BrandPage() {
  return (
    <>
      <PageIntro eyebrow="Brand kit" title="The WazaBolt brand" description={`${siteConfig.headline} ${siteConfig.supporting}`} />
      <div className="container-page flex flex-col gap-6 pb-24 pt-10">
        <Block title="Logo system">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <figure className="flex flex-col items-center justify-center gap-3 rounded-xl bg-cream p-8 ring-1 ring-line">
              <WazaBoltLogo withTagline />
              <figcaption className="text-xs text-slate">Primary horizontal</figcaption>
            </figure>
            <figure className="flex flex-col items-center justify-center gap-3 rounded-xl bg-mint p-8">
              <WazaBoltLogo layout="compact" size="lg" />
              <figcaption className="text-xs text-slate">Compact</figcaption>
            </figure>
            <figure className="flex flex-col items-center justify-center gap-3 rounded-xl bg-deep p-8">
              <WazaBoltLogo tone="dark" withTagline />
              <figcaption className="text-xs text-white/70">Dark background</figcaption>
            </figure>
            <figure className="flex flex-col items-center justify-center gap-4 rounded-xl bg-cream p-8 ring-1 ring-line">
              <div className="flex items-end gap-4">
                <WazaBoltIcon className="size-16" />
                <WazaBoltIcon className="size-8" />
                <WazaBoltIcon className="size-4" />
                <WazaBoltIcon variant="mono" className="size-10 text-deep" />
              </div>
              <figcaption className="text-xs text-slate">Icon · favicon · monochrome</figcaption>
            </figure>
          </div>
          <ul className="mt-6 grid gap-2 text-sm text-slate sm:grid-cols-2">
            <li>• Keep clear space of at least the height of the bolt around the logo.</li>
            <li>• Never stretch, recolour, rotate or add shadows to the logo.</li>
            <li>• On photos or busy backgrounds, place it on a Warm White or Deep Teal panel.</li>
            <li>• Use the icon alone for favicons and profile images — no tiny text.</li>
          </ul>
          <div className="mt-6 flex flex-wrap gap-2">
            {downloads.map((d) => (
              <a key={d.href} href={d.href} download className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-xs font-semibold text-deep hover:bg-mint">
                <Download className="size-3.5" aria-hidden /> {d.label}
              </a>
            ))}
          </div>
        </Block>

        <Block title="Colours">
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
            {colors.map((c) => (
              <li key={c.hex} className="flex flex-col gap-2">
                <span className={`h-20 rounded-xl ring-1 ring-line ${c.swatch}`} aria-hidden />
                <p className="text-sm font-semibold text-deep">{c.name}</p>
                <p className="font-mono text-xs text-slate">{c.hex}</p>
                <p className="text-xs text-slate">{c.use}</p>
              </li>
            ))}
          </ul>
          <p className="mt-6 text-sm text-slate">
            Accessibility: Waza Green buttons use Deep Teal text (5.9:1). Green text on light backgrounds uses the deeper
            shades <span className="font-mono">#12A06A</span> (large text) and <span className="font-mono">#0C8354</span> (body text).
          </p>
        </Block>

        <Block title="Typography">
          <div className="grid gap-8 md:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-slate">Headings — Plus Jakarta Sans 600/700/800</p>
              <p className="type-h1 mt-3">Turn WhatsApp into your biggest sales channel.</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-slate">Body — Inter 400/500/600</p>
              <p className="type-lead mt-3 text-slate">
                WazaBolt helps you answer customers, share products, capture orders and grow your business — all from WhatsApp.
              </p>
            </div>
          </div>
        </Block>

        <Block title="Messaging & components">
          <dl className="grid gap-4 text-sm sm:grid-cols-3">
            <div><dt className="text-slate">Brand descriptor</dt><dd className="font-semibold text-deep">{BRAND_TAGLINE}</dd></div>
            <div><dt className="text-slate">Primary message</dt><dd className="font-semibold text-deep">{siteConfig.headline}</dd></div>
            <div><dt className="text-slate">Supporting message</dt><dd className="font-semibold text-deep">{siteConfig.supporting}</dd></div>
          </dl>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <AIStatus />
            <AIStatus mode="human" />
            <WazaBoltBadge>Built for African Businesses</WazaBoltBadge>
            <WazaBoltBadge tone="gold" icon={false}>Coming Soon</WazaBoltBadge>
            <WazaBoltBadge tone="dark">WazaBolt AI</WazaBoltBadge>
          </div>
        </Block>

        <Block title="Social templates">
          <ul className="grid gap-6 md:grid-cols-2">
            {social.map((s) => (
              <li key={s.href} className="flex flex-col gap-3">
                <Image src={s.href} alt={`WazaBolt ${s.label}`} width={s.w} height={s.h} unoptimized className="max-h-96 w-auto self-start rounded-xl ring-1 ring-line" />
                <a href={s.href} download className="inline-flex items-center gap-1.5 text-sm font-semibold text-waza-700 hover:underline">
                  <Download className="size-4" aria-hidden /> {s.label}
                </a>
              </li>
            ))}
          </ul>
        </Block>
      </div>
    </>
  );
}
