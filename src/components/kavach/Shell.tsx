import { useEffect, useState, type ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  Activity,
  Bell,
  Check,
  ChevronDown,
  ChevronLeft,
  Cpu,
  FileCode2,
  FileText,
  Gauge,
  GitBranch,
  History,
  LifeBuoy,
  Map,
  Menu,
  RadioTower,
  Radar,
  ScrollText,
  Settings2,
  Shield,
  Siren,
  SlidersHorizontal,
  TestTube2,
  Users,
  Wifi,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useKavach } from "@/lib/kavach/store";
import { cn } from "@/lib/utils";

export interface NavItemDef {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string; size?: number }>;
  badgeKey?: "alerts" | "detections" | "nodes";
}

export interface NavGroupDef {
  name: string;
  items: NavItemDef[];
}

export const PRIMARY_NAV: NavItemDef[] = [
  { to: "/", label: "Command Center", icon: Gauge },
  { to: "/map", label: "Live Map", icon: Map },
  { to: "/devices", label: "Devices & Signals", icon: RadioTower, badgeKey: "nodes" },
  { to: "/calibration", label: "Calibration", icon: SlidersHorizontal },
  { to: "/history", label: "Incident History", icon: History },
  { to: "/settings", label: "Settings & Hardware", icon: Settings2 },
];

export const SECONDARY_GROUPS: NavGroupDef[] = [
  {
    name: "TACTICAL OPERATIONS",
    items: [
      { to: "/incidents", label: "Incidents", icon: Siren },
      { to: "/detections", label: "Signal Detections", icon: Radar, badgeKey: "detections" },
      { to: "/survivors", label: "Survivors Registry", icon: Users },
      { to: "/operations", label: "Rescue Operations", icon: LifeBuoy },
    ],
  },
  {
    name: "HARDWARE & SENSORS",
    items: [
      { to: "/nodes", label: "Sensor Nodes", icon: Cpu },
      { to: "/gateway", label: "Gateway Concentrator", icon: Wifi },
      { to: "/hardware", label: "Hardware Setup", icon: Activity },
      { to: "/topology", label: "Network Topology", icon: GitBranch },
    ],
  },
  {
    name: "INTELLIGENCE & SIMULATION",
    items: [
      { to: "/simulation", label: "Simulation Lab", icon: TestTube2 },
      { to: "/analytics", label: "Analytics & Telemetry", icon: Activity },
      { to: "/logs", label: "Event Logs", icon: ScrollText },
      { to: "/reports", label: "Operational Reports", icon: FileText },
    ],
  },
  {
    name: "SYSTEM & ADMINISTRATION",
    items: [
      { to: "/alerts", label: "Alerts & Warnings", icon: Bell, badgeKey: "alerts" },
      { to: "/health", label: "System Health", icon: Shield },
      { to: "/api-docs", label: "API Docs (OpenAPI)", icon: FileCode2 },
    ],
  },
];

export const NAV_GROUPS: NavGroupDef[] = [
  {
    name: "PRIMARY NAVIGATION",
    items: PRIMARY_NAV,
  },
  ...SECONDARY_GROUPS,
];

export const NAV = NAV_GROUPS.flatMap((g) => g.items.map((i) => [i.to, i.label, i.icon] as const));

function Clock() {
  const [time, setTime] = useState("--:--:--");
  useEffect(() => {
    const update = () => setTime(new Date().toLocaleTimeString("en-GB"));
    update();
    const t = setInterval(update, 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <span className="mono-num text-xs tracking-tight text-foreground/90">
      {time}
      <span className="ml-1 text-[10px] text-muted-foreground">LOCAL</span>
    </span>
  );
}

export function TraceShell({ children }: { children: ReactNode }) {
  const k = useKavach();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [notices, setNotices] = useState(false);
  const [profile, setProfile] = useState(false);
  const path = useRouterState({ select: (s) => s.location.pathname });
  useEffect(() => setOpen(false), [path]);

  const unackAlerts = k.alerts.filter((a) => !a.acknowledged).length;
  const activeDetections = k.detections.filter((d) => d.status !== "lost").length;
  const onlineNodes = k.nodes.filter((n) => n.status !== "offline").length;

  // Resolve current breadcrumb & active page metadata
  let currentGroup = "OPERATIONS";
  let currentTitle = "Command Center";
  for (const group of NAV_GROUPS) {
    const match = group.items.find((i) => i.to === path);
    if (match) {
      currentGroup = group.name;
      currentTitle = match.label;
      break;
    }
  }

  return (
    <div className="min-h-screen bg-background flex text-foreground">
      {open && (
        <Button
          variant="ghost"
          aria-label="Close navigation backdrop"
          className="fixed inset-0 z-40 h-full w-full bg-background/80 backdrop-blur-xs lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex flex-col border-r border-sidebar-border bg-sidebar transition-all duration-200",
          collapsed ? "lg:w-[72px]" : "lg:w-[240px]",
          "w-[240px]",
          open ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
        )}
      >
        {/* Brand header */}
        <div className="h-16 flex items-center gap-3 px-4 border-b border-border bg-sidebar shrink-0">
          <div className="w-8 h-8 rounded bg-primary/10 border border-primary/30 flex items-center justify-center text-primary shrink-0">
            <Radar size={20} className="animate-spin-slow" />
          </div>
          <div className={cn("overflow-hidden transition-opacity", collapsed && "lg:hidden")}>
            <div className="flex items-center gap-1.5">
              <span className="font-display text-lg font-bold tracking-tight text-foreground">
                TRACE
              </span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/15 text-primary border border-primary/25 font-semibold">
                v2.4
              </span>
            </div>
            <p className="trace-label text-[8px] text-muted-foreground truncate">
              DISASTER RESCUE COMMAND
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Close navigation"
            className="lg:hidden ml-auto text-muted-foreground hover:text-foreground"
            onClick={() => setOpen(false)}
          >
            <X size={18} />
          </Button>
        </div>

        {/* Navigation list */}
        <nav className="flex-1 overflow-y-auto trace-scroll px-2.5 py-3 space-y-3">
          {/* Primary 6 Navigation Items */}
          <div className="space-y-1">
            <p
              className={cn(
                "trace-label text-[9px] font-semibold tracking-wider text-primary px-2.5 py-1 select-none flex items-center justify-between",
                collapsed && "lg:hidden",
              )}
            >
              <span>PRIMARY COMMAND</span>
              <span className="text-[8px] px-1 py-0.2 rounded bg-primary/10 text-primary border border-primary/20">
                CORE
              </span>
            </p>
            {PRIMARY_NAV.map((item) => {
              const isActive = path === item.to;
              const Icon = item.icon;
              let badgeContent: ReactNode = null;
              if (item.badgeKey === "nodes" && onlineNodes > 0) {
                badgeContent = (
                  <span className="ml-auto text-[10px] font-mono px-1.5 py-0.2 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                    {onlineNodes} on
                  </span>
                );
              }
              return (
                <Button
                  key={item.to}
                  asChild
                  variant="ghost"
                  className={cn(
                    "w-full justify-start h-9 text-xs px-2.5 rounded transition-all",
                    isActive
                      ? "border-l-2 border-primary bg-primary/15 text-primary font-semibold shadow-xs"
                      : "text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/60",
                    collapsed && "lg:justify-center lg:px-0",
                  )}
                  title={collapsed ? item.label : undefined}
                >
                  <Link to={item.to}>
                    <Icon
                      className={cn(
                        "shrink-0",
                        isActive ? "text-primary" : "text-muted-foreground",
                      )}
                      size={16}
                    />
                    <span className={cn("truncate ml-2.5", collapsed && "lg:hidden")}>
                      {item.label}
                    </span>
                    {!collapsed && badgeContent}
                  </Link>
                </Button>
              );
            })}
          </div>
        </nav>

        {/* Sidebar footer info */}
        <div className="border-t border-border p-3 bg-sidebar/50 shrink-0">
          <div className={cn("text-[10px] space-y-1", collapsed && "lg:hidden")}>
            <div className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="font-medium text-foreground/90">TACTICAL PLATFORM</span>
            </div>
            <p className="text-muted-foreground text-[9px] leading-tight">
              TRACE Command V8.0
              <br />
              Disaster Response Operations
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="hidden lg:flex w-full justify-center mt-2 h-7 text-muted-foreground hover:text-foreground"
            onClick={() => setCollapsed((v) => !v)}
          >
            <ChevronLeft
              className={cn("transition-transform duration-200", collapsed && "rotate-180")}
              size={16}
            />
          </Button>
        </div>
      </aside>

      {/* Main content wrapper */}
      <div
        className={cn(
          "min-w-0 flex-1 flex flex-col transition-all duration-200",
          collapsed ? "lg:ml-[72px]" : "lg:ml-[240px]",
        )}
      >
        {/* Header */}
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 min-h-[58px] border-b border-border bg-background/95 backdrop-blur px-4 lg:px-7 no-print">
          <div className="flex items-center gap-3 min-w-0">
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden shrink-0"
              aria-label="Open navigation"
              onClick={() => setOpen(true)}
            >
              <Menu size={18} />
            </Button>
            <div className="shrink-0 flex items-center gap-2.5">
              <span className="font-bold text-xs tracking-wider text-primary font-mono px-2 py-0.5 rounded-md bg-primary/10 border border-primary/25 shadow-xs">
                TRACE
              </span>
              <span className="text-muted-foreground/40 text-xs font-mono">/</span>
              <h1 className="text-sm font-bold text-foreground tracking-tight whitespace-nowrap">
                {currentTitle}
              </h1>
            </div>
          </div>

          {/* Right Header: Active Incident, Mode Indicator, Gateway Status, Clock & Alerts */}
          <div className="flex items-center gap-2 text-xs">
            {/* Active Incident Selector */}
            <div className="hidden lg:flex items-center gap-1.5 border border-border/80 rounded-lg px-2.5 h-8 bg-card/70 shadow-xs">
              <span className="text-[9px] font-mono text-muted-foreground uppercase font-semibold">INCIDENT</span>
              <select
                aria-label="Active incident"
                value={k.incidentId}
                onChange={(e) => k.selectIncident(e.target.value)}
                className="bg-transparent text-xs text-foreground outline-none cursor-pointer max-w-44 truncate font-medium"
              >
                {k.incidents.map((i) => (
                  <option key={i.id} value={i.id} className="bg-card text-foreground">
                    {i.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Application Mode Switch */}
            <div className="flex items-center border border-border/80 rounded-lg overflow-hidden bg-card/70 text-xs p-0.5 h-8 shadow-xs">
              <button
                type="button"
                onClick={() => k.setMode("simulation")}
                className={cn(
                  "px-2.5 py-1 rounded-md flex items-center gap-1.5 transition-all font-medium text-xs h-full cursor-pointer",
                  k.mode === "simulation"
                    ? "bg-warning/20 text-warning border border-warning/40 font-semibold shadow-xs"
                    : "text-muted-foreground hover:text-foreground",
                )}
                title="Synthetic multi-sensor simulation mode"
              >
                <span
                  className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    k.mode === "simulation" ? "bg-warning animate-pulse" : "bg-muted-foreground",
                  )}
                />
                Sim
              </button>
              <button
                type="button"
                onClick={() => k.setMode("live")}
                className={cn(
                  "px-2.5 py-1 rounded-md flex items-center gap-1.5 transition-all font-medium text-xs h-full cursor-pointer",
                  k.mode === "live"
                    ? "bg-primary/20 text-primary border border-primary/40 font-semibold shadow-xs"
                    : "text-muted-foreground hover:text-foreground",
                )}
                title="Live physical hardware telemetry mode"
              >
                <span
                  className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    k.mode === "live" ? "bg-primary animate-pulse" : "bg-muted-foreground",
                  )}
                />
                Live
              </button>
            </div>

            {/* Gateway Status Badge */}
            <div
              className={cn(
                "hidden sm:flex items-center gap-1.5 px-2.5 h-8 rounded-lg border text-xs font-medium shadow-xs",
                k.gatewayConnected
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                  : "border-rose-500/30 bg-rose-500/10 text-rose-400",
              )}
              title={
                k.gatewayConnected
                  ? "Gateway N04 active on LoRa 868 MHz"
                  : "Gateway transport offline · Awaiting packet uplink"
              }
            >
              <span
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  k.gatewayConnected ? "bg-emerald-400" : "bg-rose-400 animate-pulse",
                )}
              />
              <span className="whitespace-nowrap">{k.gatewayConnected ? "Gateway Online" : "Gateway Offline"}</span>
            </div>

            {/* Backend & SSE Realtime Status Badge (visible on ultra-wide) */}
            <div className="hidden 2xl:flex items-center gap-1.5 px-2.5 h-8 rounded-lg border border-border/80 bg-card/70 text-[11px] font-medium shadow-xs">
              <span
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  k.serverReady ? "bg-emerald-400" : "bg-rose-400",
                )}
              />
              <span className="text-foreground/90">
                {k.serverReady ? "API/DB Ready" : "DB Disconnected"}
              </span>
              <span className="text-muted-foreground">·</span>
              <span
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  k.sseConnected ? "bg-primary animate-pulse" : "bg-muted-foreground",
                )}
              />
              <span className="text-muted-foreground">
                {k.sseConnected ? "SSE Active" : "Polling"}
              </span>
            </div>

            {/* Real-time Clock */}
            <div className="hidden xl:flex items-center px-2.5 h-8 rounded-lg border border-border/80 bg-card/70 shadow-xs">
              <Clock />
            </div>

            {/* Alert Bell */}
            <div className="relative">
              <Button
                variant="outline"
                size="icon"
                aria-label="Alerts and notifications"
                title="Alerts and notifications"
                className={cn(
                  "relative h-8 w-8",
                  unackAlerts > 0 && "border-warning/50 text-warning",
                )}
                onClick={() => setNotices((v) => !v)}
              >
                <Bell size={15} />
                {unackAlerts > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-warning text-primary-foreground text-[9px] font-bold flex items-center justify-center">
                    {unackAlerts}
                  </span>
                )}
              </Button>

              {/* Notification Popover */}
              {notices && (
                <div className="absolute top-full right-0 mt-2 w-80 max-w-[90vw] rounded-md border border-border bg-card p-4 shadow-xl z-50 event-arrival">
                  <div className="flex items-center justify-between pb-2 border-b border-border">
                    <p className="font-semibold text-xs text-foreground">Operational Alerts</p>
                    <span className="text-[10px] text-muted-foreground mono-num">
                      {unackAlerts} pending
                    </span>
                  </div>
                  <div className="py-2 space-y-2 max-h-64 overflow-y-auto trace-scroll">
                    {k.alerts.length > 0 ? (
                      k.alerts.slice(0, 5).map((a) => (
                        <div
                          key={a.id}
                          className="rounded border border-border/80 bg-background/50 p-2.5 text-xs space-y-1"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-medium text-foreground">{a.title}</span>
                            <span className="text-[10px] text-muted-foreground mono-num">
                              {a.target}
                            </span>
                          </div>
                          <p className="text-muted-foreground text-[11px] leading-tight">
                            {a.reason}
                          </p>
                          <div className="flex items-center justify-between pt-1">
                            <span className="text-[9px] text-muted-foreground/70">
                              {new Date(a.ts).toLocaleTimeString("en-GB")}
                            </span>
                            {!a.acknowledged ? (
                              <button
                                type="button"
                                className="text-[10px] text-primary hover:underline font-medium"
                                onClick={() => k.acknowledge(a.id)}
                              >
                                Acknowledge
                              </button>
                            ) : (
                              <span className="text-[10px] text-success flex items-center gap-0.5">
                                <Check size={10} /> acked
                              </span>
                            )}
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-muted-foreground py-3 text-center">
                        No active alerts recorded.
                      </p>
                    )}
                  </div>
                  <Button
                    asChild
                    variant="outline"
                    size="sm"
                    className="w-full mt-2 h-7 text-xs"
                    onClick={() => setNotices(false)}
                  >
                    <Link to="/history">View All Alerts & Logs ({k.alerts.length})</Link>
                  </Button>
                </div>
              )}
            </div>

            {/* Authenticated Operator Profile & Role Switcher */}
            <div className="relative">
              <Button
                variant="outline"
                size="sm"
                aria-label="Operator menu"
                className="h-8 px-2 flex items-center gap-1.5"
                onClick={() => setProfile((v) => !v)}
              >
                <span className="w-5 h-5 rounded-full bg-primary/20 text-primary border border-primary/30 text-[10px] font-bold flex items-center justify-center">
                  {k.currentUser?.role ? k.currentUser.role.substring(0, 2).toUpperCase() : "OP"}
                </span>
                <span className="hidden lg:inline text-xs text-foreground/90 font-medium max-w-[110px] truncate">
                  {k.currentUser?.full_name || "Operator Console"}
                </span>
                <ChevronDown size={12} className="text-muted-foreground" />
              </Button>

              {profile && (
                <div className="absolute right-0 top-full mt-2 w-64 rounded-md border border-border bg-card p-3 shadow-xl z-50 text-xs event-arrival space-y-2.5">
                  <div className="border-b border-border pb-2">
                    <div className="flex items-center justify-between">
                      <p className="font-semibold text-foreground truncate">
                        {k.currentUser?.full_name || "Authenticated Operator"}
                      </p>
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-primary/15 text-primary border border-primary/20 font-medium">
                        {k.currentUser?.role || "Responder"}
                      </span>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {k.currentUser?.email || "internal@trace-rescue.internal"}
                    </p>
                  </div>

                  {/* Switch Role Fast Selector */}
                  <div className="space-y-1">
                    <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">
                      Switch Testing Role
                    </p>
                    <div className="grid grid-cols-1 gap-1">
                      {(
                        [
                          "Administrator",
                          "Incident Commander",
                          "Responder",
                          "Analyst",
                          "Viewer",
                        ] as const
                      ).map((r) => (
                        <button
                          key={r}
                          type="button"
                          onClick={() => {
                            k.switchUserRole(r);
                            setProfile(false);
                          }}
                          className={cn(
                            "text-left px-2 py-1 rounded text-[11px] transition-colors flex items-center justify-between",
                            k.currentUser?.role === r
                              ? "bg-primary text-primary-foreground font-semibold"
                              : "hover:bg-muted text-muted-foreground hover:text-foreground",
                          )}
                        >
                          <span>{r}</span>
                          {k.currentUser?.role === r && <Check size={12} />}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="pt-2 border-t border-border flex items-center justify-between">
                    <Button
                      asChild
                      variant="ghost"
                      size="sm"
                      className="h-6 text-[10px] px-2 text-muted-foreground hover:text-foreground"
                      onClick={() => setProfile(false)}
                    >
                      <Link to="/devices">Devices & Calibration</Link>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-6 text-[10px] px-2 text-destructive border-destructive/30 hover:bg-destructive/10"
                      onClick={() => {
                        k.logoutUser();
                        setProfile(false);
                      }}
                    >
                      Sign Out
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Main page content */}
        <main key={path} className="flex-1 p-4 lg:p-6 fade-in-up">
          {children}
        </main>

        {/* Tactical Footer */}
        <footer className="px-4 lg:px-6 py-3 border-t border-border/80 flex flex-wrap items-center justify-between gap-2 text-[10px] text-muted-foreground no-print bg-background/50">
          <div className="flex items-center gap-3">
            <span className="font-semibold text-foreground/80">TRACE RESCUE COMMAND</span>
            <span>·</span>
            <span>Triangulated Rescue Aid via Crowd-Signal Estimation</span>
          </div>
          <div className="flex items-center gap-3 mono-num">
            <span
              className={cn(
                "px-1.5 py-0.5 rounded text-[9px] font-semibold",
                k.mode === "simulation"
                  ? "bg-warning/15 text-warning border border-warning/30"
                  : "bg-primary/15 text-primary border border-primary/30",
              )}
            >
              {k.mode === "simulation" ? "SIMULATION TELEMETRY" : "HARDWARE TELEMETRY"}
            </span>
            <span>Tactical Operations v8.0 · All Systems Active</span>
          </div>
        </footer>
      </div>
    </div>
  );
}
