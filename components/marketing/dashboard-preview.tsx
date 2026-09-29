import { DashboardMock } from "@/components/marketing/dashboard-mock";
import { Reveal } from "@/components/motion/reveal";
import { Highlight, SectionHeading } from "@/components/marketing/section-heading";
import { getMessages } from "@/lib/i18n/dictionaries";
import { rich } from "@/lib/i18n/rich";

export async function DashboardPreview() {
  const t = (await getMessages()).dashboardPreview;
  return (
    <section aria-labelledby="dashboard-title" className="py-20 sm:py-28">
      <div className="container-page">
        <SectionHeading
          id="dashboard-title"
          eyebrow={t.eyebrow}
          title={rich(t.title, { hl: (c) => <Highlight>{c}</Highlight> })}
          description={t.description}
        />
        <Reveal className="relative mt-14">
          <div
            aria-hidden
            className="bg-brand-gradient absolute inset-x-12 bottom-10 top-12 -z-10 rounded-[3rem] opacity-40 blur-3xl"
          />
          <DashboardMock />
          <p className="mt-4 text-center text-xs text-slate">{t.caption}</p>
        </Reveal>
      </div>
    </section>
  );
}
