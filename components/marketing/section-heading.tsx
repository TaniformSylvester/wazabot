import { cn } from "@/lib/utils";

export function Eyebrow({ children, tone = "light", className }: { children: React.ReactNode; tone?: "light" | "dark"; className?: string }) {
  return (
    <span
      className={cn(
        "type-label inline-flex items-center gap-2 rounded-full px-3 py-1.5",
        tone === "dark" ? "bg-white/10 text-waza-300" : "bg-mint text-waza-800",
        className,
      )}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-gold" />
      {children}
    </span>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  align = "center",
  tone = "light",
  className,
  id,
}: {
  eyebrow?: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  align?: "center" | "left";
  tone?: "light" | "dark";
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
      {eyebrow ? <Eyebrow tone={tone}>{eyebrow}</Eyebrow> : null}
      <h2 id={id} className={cn("type-h2", tone === "dark" && "text-white")}>
        {title}
      </h2>
      {description ? (
        <p className={cn("type-lead", tone === "dark" ? "text-white/70" : "text-slate")}>{description}</p>
      ) : null}
    </div>
  );
}

/** Waza Green accent for key phrases in headings (waza-600 keeps 3:1+ for large text). */
export function Highlight({
  children,
  className,
  tone = "light",
}: {
  children: React.ReactNode;
  className?: string;
  tone?: "light" | "dark";
}) {
  return <span className={cn(tone === "dark" ? "text-waza-400" : "text-waza-600", className)}>{children}</span>;
}
