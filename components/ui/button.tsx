import * as React from "react";
import { Slot } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-full font-semibold transition-all duration-200 outline-none focus-visible:ring-4 focus-visible:ring-ring/35 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        // Waza Green with Deep Teal text: 5.9:1 contrast (white on #16B878 would be 2.6:1).
        default:
          "bg-primary font-bold text-primary-foreground shadow-[0_6px_16px_-8px_rgb(22_184_120/0.7)] hover:-translate-y-0.5 hover:bg-waza-400 hover:shadow-glow active:translate-y-0",
        outline:
          "border-2 border-waza-500 bg-white/60 text-deep hover:-translate-y-0.5 hover:bg-mint active:translate-y-0",
        secondary: "bg-mint text-deep hover:bg-waza-100",
        ghost: "text-deep hover:bg-mint",
        dark: "bg-deep text-white hover:-translate-y-0.5 hover:bg-deep-700 active:translate-y-0",
        gold: "bg-gold font-bold text-deep hover:-translate-y-0.5 hover:bg-gold-200 active:translate-y-0",
        "outline-light":
          "border-2 border-white/30 bg-transparent text-white hover:-translate-y-0.5 hover:border-white hover:bg-white/10 active:translate-y-0",
        link: "rounded-none text-waza-700 underline-offset-4 hover:underline",
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
