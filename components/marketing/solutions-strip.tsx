import { IndustryCard } from "@/components/marketing/industry-card";
import { solutions } from "@/config/solutions";
import { getLocale, getMessages } from "@/lib/i18n/dictionaries";
import { localizePath } from "@/lib/i18n/paths";

export async function SolutionsStrip() {
  const [locale, t] = await Promise.all([getLocale(), getMessages()]);
  return (
    <section aria-labelledby="solutions-strip-title" className="bg-mint/70">
      <div className="container-page py-12 sm:py-14">
        <div className="flex flex-col items-center gap-2 text-center sm:flex-row sm:justify-between sm:text-left">
          <h2 id="solutions-strip-title" className="type-h3 text-xl sm:text-2xl">
            {t.solutionsStrip.title}
          </h2>
          <p className="text-sm text-slate">{t.solutionsStrip.text}</p>
        </div>
        <ul className="mt-8 grid grid-cols-4 gap-1 sm:gap-3 lg:grid-cols-8">
          {solutions.map(({ key, slug, icon, tone }) => (
            <li key={slug}>
              <IndustryCard href={localizePath(locale, `/solutions#${slug}`)} name={t.solutions.items[key].name} icon={icon} tone={tone} />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
