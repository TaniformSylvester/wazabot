import Image from "next/image";
import { Download } from "lucide-react";

import { AIStatus } from "@/components/brand/ai-status";
import { WazaBoltIcon, WazaBoltLogo } from "@/components/brand/logo";
import { WazaBoltBadge } from "@/components/brand/wazabolt-badge";
import { PageIntro } from "@/components/marketing/page-intro";
import { getMessages } from "@/lib/i18n/dictionaries";
import { pageMetadata } from "@/lib/i18n/metadata";
import { rich } from "@/lib/i18n/rich";

export const generateMetadata = () => pageMetadata("brand", "/brand", { index: false });

/** Colour names are brand names and stay in English. */
const colors = [
  { key: "green", name: "Waza Green", hex: "#16B878", swatch: "bg-waza-500" },
  { key: "deep", name: "Deep Teal", hex: "#102A2A", swatch: "bg-deep" },
  { key: "gold", name: "Golden", hex: "#FFC83D", swatch: "bg-gold" },
  { key: "coral", name: "Coral", hex: "#FF6B4A", swatch: "bg-coral-500" },
  { key: "mint", name: "Soft Mint", hex: "#E9FAF3", swatch: "bg-mint" },
  { key: "cream", name: "Warm White", hex: "#FFFDF8", swatch: "bg-cream" },
  { key: "slate", name: "Slate", hex: "#526262", swatch: "bg-slate" },
] as const;

const downloads = [
  { key: "icon", href: "/logo/wazabolt-icon.svg" },
  { key: "iconDark", href: "/logo/wazabolt-icon-dark-bg.svg" },
  { key: "iconMono", href: "/logo/wazabolt-icon-mono.svg" },
  { key: "horizontal", href: "/logo/wazabolt-logo-horizontal.svg" },
  { key: "horizontalDark", href: "/logo/wazabolt-logo-horizontal-dark.svg" },
  { key: "compact", href: "/logo/wazabolt-logo-compact.svg" },
  { key: "app", href: "/logo/wazabolt-icon-512.png" },
  { key: "whatsapp", href: "/logo/wazabolt-whatsapp-profile.png" },
] as const;

const social = [
  { key: "facebook", href: "/brand-assets/facebook-cover.png", w: 1640, h: 624 },
  { key: "instagramPost", href: "/brand-assets/instagram-post.png", w: 1080, h: 1080 },
  { key: "instagramStory", href: "/brand-assets/instagram-story.png", w: 1080, h: 1920 },
  { key: "og", href: "/en/opengraph-image", w: 1200, h: 630 },
] as const;

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-white p-6 shadow-card sm:p-8">
      <h2 className="type-h3 text-xl">{title}</h2>
      <div className="mt-6">{children}</div>
    </section>
  );
}

export default async function BrandPage() {
  const messages = await getMessages();
  const t = messages.brandPage;
  const brand = messages.common.brand;
  return (
    <>
      <PageIntro eyebrow={t.eyebrow} title={t.title} description={`${brand.headline} ${brand.supporting}`} />
      <div className="container-page flex flex-col gap-6 pb-24 pt-10">
        <Block title={t.logoSystem}>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <figure className="flex flex-col items-center justify-center gap-3 rounded-xl bg-cream p-8 ring-1 ring-line">
              <WazaBoltLogo withTagline tagline={brand.tagline} />
              <figcaption className="text-xs text-slate">{t.logoCaptions.horizontal}</figcaption>
            </figure>
            <figure className="flex flex-col items-center justify-center gap-3 rounded-xl bg-mint p-8">
              <WazaBoltLogo layout="compact" size="lg" />
              <figcaption className="text-xs text-slate">{t.logoCaptions.compact}</figcaption>
            </figure>
            <figure className="flex flex-col items-center justify-center gap-3 rounded-xl bg-deep p-8">
              <WazaBoltLogo tone="dark" withTagline tagline={brand.tagline} />
              <figcaption className="text-xs text-white/70">{t.logoCaptions.dark}</figcaption>
            </figure>
            <figure className="flex flex-col items-center justify-center gap-4 rounded-xl bg-cream p-8 ring-1 ring-line">
              <div className="flex items-end gap-4">
                <WazaBoltIcon className="size-16" />
                <WazaBoltIcon className="size-8" />
                <WazaBoltIcon className="size-4" />
                <WazaBoltIcon variant="mono" className="size-10 text-deep" />
              </div>
              <figcaption className="text-xs text-slate">{t.logoCaptions.icon}</figcaption>
            </figure>
          </div>
          <ul className="mt-6 grid gap-2 text-sm text-slate sm:grid-cols-2">
            {t.logoRules.map((rule) => (
              <li key={rule}>• {rule}</li>
            ))}
          </ul>
          <div className="mt-6 flex flex-wrap gap-2">
            {downloads.map((d) => (
              <a key={d.href} href={d.href} download className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-xs font-semibold text-deep hover:bg-mint">
                <Download className="size-3.5" aria-hidden /> {t.downloads[d.key]}
              </a>
            ))}
          </div>
        </Block>

        <Block title={t.colours}>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
            {colors.map((c) => (
              <li key={c.hex} className="flex flex-col gap-2">
                <span className={`h-20 rounded-xl ring-1 ring-line ${c.swatch}`} aria-hidden />
                <p className="text-sm font-semibold text-deep">{c.name}</p>
                <p className="font-mono text-xs text-slate">{c.hex}</p>
                <p className="text-xs text-slate">{t.colourUses[c.key]}</p>
              </li>
            ))}
          </ul>
          <p className="mt-6 text-sm text-slate">
            {rich(t.accessibility, { mono: (c) => <span className="font-mono">{c}</span> })}
          </p>
        </Block>

        <Block title={t.typography}>
          <div className="grid gap-8 md:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-slate">{t.headingsLabel}</p>
              <p className="type-h1 mt-3">{t.headingsSample}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-slate">{t.bodyLabel}</p>
              <p className="type-lead mt-3 text-slate">{t.bodySample}</p>
            </div>
          </div>
        </Block>

        <Block title={t.messaging}>
          <dl className="grid gap-4 text-sm sm:grid-cols-3">
            <div><dt className="text-slate">{t.descriptor}</dt><dd className="font-semibold text-deep">{brand.tagline}</dd></div>
            <div><dt className="text-slate">{t.primaryMessage}</dt><dd className="font-semibold text-deep">{brand.headline}</dd></div>
            <div><dt className="text-slate">{t.supportingMessage}</dt><dd className="font-semibold text-deep">{brand.supporting}</dd></div>
          </dl>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <AIStatus />
            <AIStatus mode="human" />
            <WazaBoltBadge>{t.badgeSample}</WazaBoltBadge>
            <WazaBoltBadge tone="gold" icon={false}>{messages.common.badges.comingSoon}</WazaBoltBadge>
            <WazaBoltBadge tone="dark">WazaBolt AI</WazaBoltBadge>
          </div>
        </Block>

        <Block title={t.social}>
          <p className="-mt-3 mb-5 text-sm text-slate">{t.socialNote}</p>
          <ul className="grid gap-6 md:grid-cols-2">
            {social.map((s) => (
              <li key={s.href} className="flex flex-col gap-3">
                <Image src={s.href} alt={`WazaBolt ${t.socialLabels[s.key]}`} width={s.w} height={s.h} unoptimized className="max-h-96 w-auto self-start rounded-xl ring-1 ring-line" />
                <a href={s.href} download className="inline-flex items-center gap-1.5 text-sm font-semibold text-waza-700 hover:underline">
                  <Download className="size-4" aria-hidden /> {t.socialLabels[s.key]}
                </a>
              </li>
            ))}
          </ul>
        </Block>
      </div>
    </>
  );
}
