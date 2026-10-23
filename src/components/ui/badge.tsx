import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold transition-colors focus:outline-none focus:ring-1 focus:ring-ring font-mono tracking-tight",
  {
    variants: {
      variant: {
        default: "border-sky-500/30 bg-sky-500/15 text-sky-400 shadow-xs",
        secondary:
          "border-border/60 bg-secondary/80 text-muted-foreground hover:bg-secondary",
        destructive:
          "border-red-500/30 bg-red-500/15 text-red-400 shadow-xs",
        outline: "border-border/80 text-foreground/90 bg-card/40",
        success: "border-emerald-500/30 bg-emerald-500/15 text-emerald-400 shadow-xs",
        warning: "border-amber-500/30 bg-amber-500/15 text-amber-400 shadow-xs",
        tactical: "border-sky-500/40 bg-sky-500/20 text-sky-300 font-bold shadow-xs",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
