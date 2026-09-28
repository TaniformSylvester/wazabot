import { cn } from "@/lib/utils";

export function SectionHeading({
  eyebrow,
  title,
  description,
  align = "center",
  className,
  id,
}: {
  eyebrow?: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  align?: "center" | "left";
  className?: string;
  id?: string;
}) {
  return (
    <div
      className={cn(
        "flex max-w-2xl flex-col gap-4",
        align === "center" ? "mx-auto items-center text-center" : "items-start text-left",
        className,
      )}
    >
      {eyebrow ? (
        <span className="rounded-full bg-mint px-3.5 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-waza-800">
          {eyebrow}
        </span>
      ) : null}
      <h2 id={id} className="text-3xl font-extrabold leading-[1.1] sm:text-4xl lg:text-[2.75rem]">
        {title}
      </h2>
      {description ? (
        <p className="text-base leading-relaxed text-slate-waza sm:text-lg">{description}</p>
      ) : null}
    </div>
  );
}

/** Green highlight for key phrases inside headings (large text → waza-600 for contrast). */
export function Highlight({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn("text-waza-600", className)}>{children}</span>;
}
