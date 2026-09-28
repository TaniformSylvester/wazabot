import * as React from "react";
import { Slot } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-full font-semibold transition-all duration-200 outline-none focus-visible:ring-4 focus-visible:ring-ring/40 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-[0_6px_16px_-6px_rgb(12_131_84/0.55)] hover:bg-waza-800 hover:shadow-[0_10px_20px_-8px_rgb(12_131_84/0.6)] active:translate-y-px",
        outline:
          "border-2 border-waza-700 bg-white/70 text-waza-800 hover:bg-mint active:translate-y-px",
        secondary: "bg-mint text-deep hover:bg-waza-100",
        ghost: "text-deep hover:bg-mint hover:text-waza-800",
        dark: "bg-deep text-white hover:bg-deep-800",
        gold: "bg-gold text-deep hover:bg-[#ffd666]",
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
