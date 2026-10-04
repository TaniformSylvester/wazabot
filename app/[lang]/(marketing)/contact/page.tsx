import { Mail, MapPin, MessageCircle, Phone } from "lucide-react";

import { PageIntro } from "@/components/marketing/page-intro";
import { siteConfig } from "@/config/site";
import { getMessages } from "@/lib/i18n/dictionaries";
import { pageMetadata } from "@/lib/i18n/metadata";

export const generateMetadata = () => pageMetadata("contact", "/contact");

export default async function ContactPage() {
  const t = (await getMessages()).pages.contact;
  const c = siteConfig.contact;
  const cards = [
    { icon: MessageCircle, label: t.whatsapp, value: c.phone, href: `https://wa.me/${c.whatsappNumber}?text=${encodeURIComponent(t.whatsappGreeting)}`, action: t.chatWhatsapp, external: true },
    { icon: Phone, label: t.phone, value: c.phone, href: c.phoneHref, action: t.callUs, external: false },
    { icon: Mail, label: t.email, value: c.email, href: `mailto:${c.email}`, action: t.writeUs, external: false },
    { icon: MapPin, label: t.address, value: c.address, href: c.mapUrl, action: t.openMap, external: true },
  ];

  return (
    <>
      <PageIntro eyebrow={t.eyebrow} title={t.title} description={t.description} />
      <section className="container-page py-16">
        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {cards.map(({ icon: Icon, label, value, href, action, external }) => (
            <li key={label} className="flex flex-col rounded-2xl border border-line bg-white p-6 shadow-card">
              <span className="grid size-11 place-items-center rounded-xl bg-mint text-waza-700">
                <Icon className="size-5" aria-hidden />
              </span>
              <h2 className="type-h3 mt-4 text-lg">{label}</h2>
              <p className="type-body mt-1 break-words text-deep">{value}</p>
              <a
                href={href}
                {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                className="mt-auto pt-4 text-sm font-semibold text-waza-700 hover:underline"
              >
                {action} →
              </a>
            </li>
          ))}
        </ul>
        <p className="type-small mt-8 max-w-2xl text-slate">{t.existingCustomer}</p>
      </section>
    </>
  );
}
