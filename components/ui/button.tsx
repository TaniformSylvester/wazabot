import * as React from "react";
import { Slot } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-full font-semibold transition-all duration-200 outline-none focus-visible:ring-4 focus-visible:ring-ring/35 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-[0_6px_16px_-8px_rgb(21_18_14/0.35)] hover:-translate-y-0.5 hover:bg-bolt-400 hover:shadow-glow active:translate-y-0",
        outline:
          "border-2 border-ink/85 bg-transparent text-ink hover:-translate-y-0.5 hover:bg-ink hover:text-sand active:translate-y-0",
        secondary: "bg-sand-100 text-ink hover:bg-sand-200",
        ghost: "text-ink hover:bg-sand-100",
        dark: "bg-ink text-sand hover:-translate-y-0.5 hover:bg-ink-700 active:translate-y-0",
        "outline-light":
          "border-2 border-sand/30 bg-transparent text-sand hover:-translate-y-0.5 hover:border-sand hover:bg-sand/10 active:translate-y-0",
        link: "rounded-none text-ember-700 underline-offset-4 hover:underline",
      },
      size: {
        default: "h-11 px-5 text-[0.9375rem]",
        sm: "h-9 px-4 text-sm",
        lg: "h-13 px-7 text-base",
        icon: "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);
function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot.Root : "button";

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
