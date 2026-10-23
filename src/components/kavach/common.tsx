import type { ReactNode } from "react";
import { HelpCircle } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn, formatCsv } from "@/lib/utils";
import type { NodeStatus, Priority, Severity } from "@/lib/kavach/types";

export { formatCsv };

export const fmtTime = (ts: number) => new Date(ts).toLocaleTimeString("en-GB", { hour12: false });

export const fmtDateTime = (ts: number) => new Date(ts).toLocaleString("en-GB", { hour12: false });

export const ago = (ts: number) => {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  return `${Math.round(s / 3600)}h ago`;
};

export function Term({ label, hint }: { label: string; hint: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex cursor-help items-center gap-1 underline decoration-dotted underline-offset-4">
          {label}
          <HelpCircle className="h-3 w-3 text-muted-foreground" />
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs text-xs">{hint}</TooltipContent>
    </Tooltip>
  );
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  const cls =
    priority === "HIGH"
      ? "bg-critical/12 text-critical border-critical/35"
      : priority === "MEDIUM"
        ? "bg-warning/15 text-warning border-warning/40"
        : "bg-muted text-muted-foreground border-border";
  return (
    <Badge variant="outline" className={cn("tracking-wide", cls)}>
      {priority}
    </Badge>
  );
}

export function SeverityBadge({ severity }: { severity: Severity }) {
  const map: Record<Severity, string> = {
    critical: "bg-critical/12 text-critical border-critical/35",
    warning: "bg-warning/15 text-warning border-warning/40",
    info: "bg-info/12 text-info border-info/35",
  };
  return (
    <Badge variant="outline" className={cn("uppercase", map[severity])}>
      {severity}
    </Badge>
  );
}

export function StatusDot({ status }: { status: NodeStatus }) {
  const map: Record<NodeStatus, string> = {
    online: "bg-success",
    degraded: "bg-warning",
    offline: "bg-critical",
  };
  return (
    <span className="inline-flex items-center gap-1.5 text-xs capitalize">
      <span className={cn("h-2 w-2 rounded-full", map[status])} />
      {status}
    </span>
  );
}

export function SectionHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  hint,
  text,
}: {
  icon?: ReactNode;
  title?: string;
  hint?: string;
  text?: string;
}) {
  const displayTitle = title ?? text ?? "No records available";
  const displayHint =
    hint ?? "Check gateway connections or activate the simulation loop to produce observations.";
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border px-6 py-10 text-center">
      {icon && <div className="text-muted-foreground">{icon}</div>}
      <p className="text-sm font-medium text-foreground/90">{displayTitle}</p>
      {displayHint && <p className="max-w-md text-xs text-muted-foreground/70">{displayHint}</p>}
    </div>
  );
}

export function Metric({
  label,
  value,
  unit,
  tone = "default",
}: {
  label: string;
  value: string | number;
  unit?: string;
  tone?: "default" | "critical" | "warning" | "success";
}) {
  const toneCls = {
    default: "text-foreground",
    critical: "text-critical",
    warning: "text-warning",
    success: "text-success",
  }[tone];
  return (
    <div className="rounded-xl border border-border/80 bg-secondary/50 p-3 shadow-xs">
      <p className="text-[10px] font-mono uppercase tracking-wide text-muted-foreground font-semibold">{label}</p>
      <p className={cn("mono-num text-lg font-bold tracking-tight mt-0.5", toneCls)}>
        {value}
        {unit && <span className="ml-1 text-xs font-normal text-muted-foreground">{unit}</span>}
      </p>
    </div>
  );
}

/** Trigger browser file download of RFC-4180 formatted CSV data */
export function exportCsv(name: string, headers: string[], rows: unknown[][]) {
  if (!headers.length && !rows.length) {
    toast.error("No records available to export");
    return;
  }
  try {
    const text = formatCsv(headers, rows);
    const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `trace-${name}-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${name} data to CSV (${rows.length} records)`);
  } catch (err) {
    toast.error(`Export failed: ${String(err)}`);
  }
}
