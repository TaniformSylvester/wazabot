import { cn } from "@/lib/utils";

export function Eyebrow({ children, tone = "light", className }: { children: React.ReactNode; tone?: "light" | "dark"; className?: string }) {
  return (
    <span
      className={cn(
        "type-label inline-flex items-center gap-2",
        tone === "dark" ? "text-bolt-400" : "text-ember-700",
        className,
      )}
    >
      <span aria-hidden className="h-[3px] w-5 rounded-full bg-bolt-500" />
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
      <h2 id={id} className={cn("type-h2", tone === "dark" && "text-sand")}>
        {title}
      </h2>
      {description ? (
        <p className={cn("type-lead", tone === "dark" ? "text-sand/70" : "text-stone")}>{description}</p>
      ) : null}
    </div>
  );
}

/** Accent for key phrases in headings (Ember 600 on sand: 4.1:1, large text). */
export function Highlight({
  children,
  className,
  tone = "light",
}: {
  children: React.ReactNode;
  className?: string;
  tone?: "light" | "dark";
}) {
  return <span className={cn(tone === "dark" ? "text-bolt-400" : "text-ember-600", className)}>{children}</span>;
}
