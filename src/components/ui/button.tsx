import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-xs font-medium cursor-pointer transition-all duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98] [&_svg]:pointer-events-none [&_svg]:size-3.5 [&_svg]:shrink-0 select-none",
  {
    variants: {
      variant: {
        default:
          "bg-gradient-to-r from-sky-500 to-cyan-500 text-slate-950 font-semibold shadow-md shadow-sky-500/20 hover:from-sky-400 hover:to-cyan-400 hover:shadow-sky-500/30",
        destructive:
          "bg-destructive/90 text-destructive-foreground shadow-sm hover:bg-destructive hover:shadow-red-500/20",
        outline:
          "border border-border/80 bg-card/70 text-slate-200 shadow-xs hover:bg-secondary hover:border-primary/50 hover:text-white",
        secondary:
          "bg-secondary/80 text-foreground border border-border/50 shadow-xs hover:bg-secondary hover:border-border",
        ghost: "hover:bg-secondary/70 hover:text-foreground",
        link: "text-primary underline-offset-4 hover:underline",
        tactical:
          "bg-primary/15 text-primary border border-primary/30 font-semibold shadow-xs hover:bg-primary/25 hover:border-primary/60",
        success:
          "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-semibold hover:bg-emerald-500/25 hover:border-emerald-500/50",
        warning:
          "bg-amber-500/15 text-amber-400 border border-amber-500/30 font-semibold hover:bg-amber-500/25 hover:border-amber-500/50",
      },
      size: {
        default: "h-8.5 px-3.5 py-1.5",
        sm: "h-7.5 rounded-md px-2.5 text-xs",
        lg: "h-10 rounded-lg px-6 text-sm font-semibold",
        icon: "h-8 w-8 rounded-lg",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
