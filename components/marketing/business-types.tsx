import Link from "next/link";

import { industries, moreIndustries } from "@/config/industries";
import { cn } from "@/lib/utils";

export function BusinessTypes() {
  const items = [...industries.filter((i) => i.featured), { ...moreIndustries, slug: "" }];

  return (
    <section aria-labelledby="business-types-title" className="bg-mint/70">
      <div className="container-page py-12 sm:py-14">
        <h2 id="business-types-title" className="text-center text-xl font-bold sm:text-left sm:text-2xl">
          Perfect for all types of businesses
        </h2>
        <ul className="mt-8 grid grid-cols-4 gap-x-1 gap-y-6 sm:gap-x-3 lg:grid-cols-7">
          {items.map(({ slug, name, icon: Icon, tone }) => (
            <li key={name}>
              <Link
                href={slug ? `/industries#${slug}` : "/industries"}
                className="group flex flex-col items-center gap-3 rounded-2xl p-2 text-center"
              >
                <span
                  className={cn(
                    "grid size-14 place-items-center rounded-full shadow-card sm:size-16 ring-4 ring-white transition-transform duration-200 group-hover:-translate-y-1",
                    tone,
                  )}
                >
                  <Icon className="size-6 sm:size-7" aria-hidden />
                </span>
                <span className="text-xs font-medium text-deep group-hover:text-waza-800 sm:text-sm">{name}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
