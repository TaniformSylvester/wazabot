
import { CTASection } from "@/components/marketing/cta-section";
import { PageIntro } from "@/components/marketing/page-intro";
import { getMessages } from "@/lib/i18n/dictionaries";
import { pageMetadata } from "@/lib/i18n/metadata";

export const generateMetadata = () => pageMetadata("about", "/about");

export default async function AboutPage() {
  const t = (await getMessages()).pages.about;
  return (
    <>
      <PageIntro
        eyebrow={t.eyebrow}
        title={t.title}
        description={t.description}
      />
      <section className="container-page py-16">
        <ul className="grid gap-5 md:grid-cols-3">
          {t.principles.map((p, i) => (
            <li key={p.title} className="rounded-2xl border border-line bg-white p-6 shadow-card">
              <span className="font-display text-4xl font-extrabold text-waza-500">0{i + 1}</span>
              <h2 className="type-h3 mt-4 text-lg">{p.title}</h2>
              <p className="type-body mt-2 text-slate">{p.text}</p>
            </li>
          ))}
        </ul>
      </section>
      <CTASection />
    </>
  );
}
