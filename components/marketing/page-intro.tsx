import { Eyebrow } from "@/components/marketing/section-heading";
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
    <div className={cn("relative overflow-hidden", className)}>
      <div aria-hidden className="bg-geo absolute inset-0 -z-10 [mask-image:radial-gradient(50%_90%_at_50%_0%,black,transparent)]" />
      <div className="container-page flex max-w-3xl flex-col items-center gap-5 pb-6 pt-14 text-center sm:pt-20">
        <Eyebrow>{eyebrow}</Eyebrow>
        <h1 className="type-h1">{title}</h1>
        {description ? <p className="type-lead text-slate">{description}</p> : null}
      </div>
    </div>
  );
}
