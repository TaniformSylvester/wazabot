import { cn } from "@/lib/utils";

/** Compact header for secondary marketing pages. */
export function PageIntro({
  eyebrow,
  title,
  description,
  className,
}: {
  eyebrow: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("bg-[radial-gradient(60%_80%_at_50%_0%,#e9faf3_0%,transparent_70%)]", className)}>
      <div className="container-page flex max-w-3xl flex-col items-center gap-4 pb-4 pt-14 text-center sm:pt-20">
        <span className="rounded-full bg-mint px-3.5 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-waza-800">
          {eyebrow}
        </span>
        <h1 className="text-4xl font-extrabold leading-[1.08] sm:text-5xl">{title}</h1>
        {description ? <p className="text-lg text-slate-waza">{description}</p> : null}
      </div>
    </div>
  );
}
