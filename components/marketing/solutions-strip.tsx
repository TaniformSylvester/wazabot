import Link from "next/link";

import { moreSolutions, solutions, tones } from "@/config/solutions";
import { cn } from "@/lib/utils";

export function SolutionsStrip() {
  const items = [...solutions.filter((s) => s.featured), { ...moreSolutions, slug: "" }];

  return (
    <section aria-labelledby="solutions-strip-title" className="border-y border-border bg-card">
      <div className="container-page flex flex-col gap-8 py-10 lg:flex-row lg:items-center lg:gap-10">
        <h2 id="solutions-strip-title" className="type-h3 shrink-0 text-center lg:max-w-44 lg:text-left">
          Built for businesses across Africa
        </h2>
        <ul className="grid flex-1 grid-cols-4 gap-x-1 gap-y-6 sm:gap-x-3 lg:grid-cols-7">
          {items.map(({ slug, name, icon: Icon, tone }) => (
            <li key={name}>
              <Link
                href={slug ? `/solutions#${slug}` : "/solutions"}
                className="group flex flex-col items-center gap-2.5 rounded-2xl p-1.5 text-center"
              >
                <span
                  className={cn(
                    "grid size-13 place-items-center rounded-2xl transition-transform duration-200 group-hover:-translate-y-1 group-hover:rotate-[-4deg] sm:size-14",
                    tones[tone],
                  )}
                >
                  <Icon className="size-6" aria-hidden />
                </span>
                <span className="text-xs font-medium text-ink sm:text-sm">{name}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
