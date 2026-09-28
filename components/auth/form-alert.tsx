import { CircleAlert, CircleCheck, Info } from "lucide-react";

import { cn } from "@/lib/utils";

const styles = {
  error: { box: "border-ember-200 bg-ember-50 text-ember-800", icon: CircleAlert },
  success: { box: "border-success/25 bg-success-bg text-success", icon: CircleCheck },
  info: { box: "border-bolt-200 bg-bolt-50 text-bolt-800", icon: Info },
} as const;

export function FormAlert({
  tone,
  children,
  className,
}: {
  tone: keyof typeof styles;
  children: React.ReactNode;
  className?: string;
}) {
  const { box, icon: Icon } = styles[tone];
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn("flex items-start gap-3 rounded-xl border px-4 py-3 text-sm", box, className)}
    >
      <Icon className="mt-0.5 size-4.5 shrink-0" aria-hidden />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
