import { useState, useMemo } from "react";
import {
  History,
  FileText,
  Download,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  Clock,
  MapPin,
  Shield,
  Plus,
  Compass,
  ScrollText,
  ChevronDown,
  ChevronRight,
  Filter,
  Printer,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useKavach } from "@/lib/kavach/store";
import type { AppEvent } from "@/lib/kavach/types";
import { exportCsv, fmtDateTime, SeverityBadge, PriorityBadge } from "./common";
import { cn } from "@/lib/utils";

export function IncidentHistory() {
  const k = useKavach();
  const [subTab, setSubTab] = useState<"incidents" | "localization" | "events" | "reports">("incidents");
  const [selectedIncidentId, setSelectedIncidentId] = useState<string>(k.incidentId || "INC-001");
  const [reportRange, setReportRange] = useState<string>("all");
  const [eventFilter, setEventFilter] = useState<string>("");
  const [expandedRun, setExpandedRun] = useState<string | null>(null);

  const selectedIncident = k.incidents.find((i) => i.id === selectedIncidentId) || k.incidents[0];

  // Filtered application events
  const filteredEvents = useMemo(() => {
    return (k.events || []).filter((e: AppEvent) => {
      if (!eventFilter) return true;
      const term = eventFilter.toLowerCase();
      return (
        (e.message?.toLowerCase().includes(term) ?? false) ||
        (e.source?.toLowerCase().includes(term) ?? false) ||
        (e.type?.toLowerCase().includes(term) ?? false)
      );
    });
  }, [k.events, eventFilter]);

  // Export CSV handler
  const handleExportCsv = () => {
    const headers = [
      "Timestamp",
      "Event_ID",
      "Type",
      "Severity",
      "Source",
      "Message",
      "Incident_ID",
    ];
    const rows = (k.events || []).map((e: AppEvent) => [
      new Date(e.ts).toISOString(),
      e.id,
      e.type,
      e.severity,
      e.source,
      e.message,
      e.incidentId || selectedIncidentId,
    ]);
    exportCsv(`incident_${selectedIncidentId}_audit`, headers, rows);
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border/60 pb-4">
        <div>
          <p className="trace-label text-[9px] font-semibold tracking-wider text-primary mb-1">
            TRACE / MISSION AUDIT & RETROSPECTIVE
          </p>
          <h1 className="trace-heading text-foreground">Incident History</h1>
          <p className="text-xs text-muted-foreground mt-1 max-w-2xl">
            Historical incident records, past multilateration runs, operational event timelines, and
            mission export.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs gap-1.5"
            onClick={handleExportCsv}
          >
            <Download size={13} />
            Export Mission CSV
          </Button>

          {/* Sub-tab Navigation */}
          <div className="flex items-center gap-1 bg-card border border-border p-1 rounded-md text-xs">
            <Button
              size="sm"
              variant={subTab === "incidents" ? "default" : "ghost"}
              className="h-7 text-xs"
              onClick={() => setSubTab("incidents")}
            >
              Incidents ({k.incidents.length})
            </Button>
            <Button
              size="sm"
              variant={subTab === "localization" ? "default" : "ghost"}
              className="h-7 text-xs"
              onClick={() => setSubTab("localization")}
            >
              Localization Runs ({k.zones.length})
            </Button>
            <Button
              size="sm"
              variant={subTab === "events" ? "default" : "ghost"}
              className="h-7 text-xs"
              onClick={() => setSubTab("events")}
            >
              Audit Events ({k.events.length})
            </Button>
            <Button
              size="sm"
              variant={subTab === "reports" ? "default" : "ghost"}
              className="h-7 text-xs"
              onClick={() => setSubTab("reports")}
            >
              Reports & Export
            </Button>
          </div>
        </div>
      </div>

      {/* =========================================================================
         SUBTAB 1: INCIDENTS OVERVIEW & TIMELINE
         ========================================================================= */}
      {subTab === "incidents" && (
        <div className="grid lg:grid-cols-3 gap-5">
          {/* Incident Selector List */}
          <div className="panel p-4 space-y-3 lg:col-span-1">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-foreground pb-2 border-b border-border">
              Select Disaster Incident
            </h2>

            <div className="space-y-2">
              {k.incidents.map((inc) => (
                <div
                  key={inc.id}
                  onClick={() => {
                    setSelectedIncidentId(inc.id);
                    k.selectIncident(inc.id);
                  }}
                  className={cn(
                    "p-3 rounded border text-xs cursor-pointer transition-colors space-y-1.5",
                    selectedIncidentId === inc.id
                      ? "border-primary bg-primary/10 shadow-sm"
                      : "border-border bg-card hover:bg-secondary/40",
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-foreground">{inc.name}</span>
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[9px] uppercase font-mono",
                        inc.status === "active"
                          ? "border-success text-success"
                          : "border-muted-foreground text-muted-foreground",
                      )}
                    >
                      {inc.status}
                    </Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {inc.disaster} · {inc.location}
                  </p>
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground/80 font-mono pt-1">
                    <span>ID: {inc.id}</span>
                    <span>Commander: {inc.commander || "Field Lead"}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Selected Incident Details & Operational Log */}
          <div className="panel p-4 space-y-4 lg:col-span-2">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-border">
              <div>
                <h3 className="text-sm font-bold text-foreground">{selectedIncident?.name}</h3>
                <p className="text-xs text-muted-foreground">
                  {selectedIncident?.disaster} · {selectedIncident?.location}
                </p>
              </div>
              <Badge
                variant="outline"
                className="text-[10px] uppercase font-mono border-primary text-primary"
              >
                {selectedIncident?.status?.toUpperCase()}
              </Badge>
            </div>

            {/* Incident Metadata Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
              <div className="panel p-2.5 bg-background/50">
                <p className="trace-label text-[9px]">INCIDENT ID</p>
                <p className="font-mono font-bold text-foreground mt-0.5">{selectedIncident?.id}</p>
              </div>
              <div className="panel p-2.5 bg-background/50">
                <p className="trace-label text-[9px]">COORDINATES</p>
                <p className="font-mono font-bold text-foreground mt-0.5">
                  {selectedIncident?.lat != null &&
                  selectedIncident?.lon != null &&
                  Number.isFinite(selectedIncident.lat) &&
                  Number.isFinite(selectedIncident.lon)
                    ? `${selectedIncident.lat.toFixed(5)}°, ${selectedIncident.lon.toFixed(5)}°`
                    : "Unconfigured"}
                </p>
              </div>
              <div className="panel p-2.5 bg-background/50">
                <p className="trace-label text-[9px]">SECTOR PRIORITY</p>
                <p className="font-mono font-bold text-warning mt-0.5">CRITICAL TACTICAL</p>
              </div>
            </div>

            {/* Notes & Tactical Instructions */}
            <div className="panel p-3 bg-card/60 space-y-1 text-xs">
              <p className="font-semibold text-foreground">Tactical Mission Directive:</p>
              <p className="text-muted-foreground leading-relaxed">
                {selectedIncident?.notes ||
                  "Operational command pass initiated. Ground sensor triangulation active."}
              </p>
            </div>

            {/* Chronological Event Timeline */}
            <div className="space-y-2 pt-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Operational Incident Timeline ({selectedIncident?.timeline?.length || 0})
              </h4>
              <div className="space-y-1.5 font-mono text-xs">
                {selectedIncident?.timeline && selectedIncident.timeline.length > 0 ? (
                  selectedIncident.timeline.map((entry, idx) => (
                    <div
                      key={idx}
                      className="p-2 rounded bg-background/40 border border-border/80 flex items-start gap-2.5"
                    >
                      <Clock size={13} className="text-primary shrink-0 mt-0.5" />
                      <span className="text-foreground">{entry}</span>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-muted-foreground py-2">
                    No timeline entries recorded yet.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
         SUBTAB 2: LOCALIZATION RUNS HISTORY
         ========================================================================= */}
      {subTab === "localization" && (
        <div className="panel p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-border pb-2.5">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-foreground flex items-center gap-2">
              <Compass size={14} className="text-warning" />
              Multilateration & Search Zone Runs
            </h2>
            <Badge variant="outline" className="text-[10px] font-mono">
              Algorithm: TRACE-EST-V6.1-GDOP
            </Badge>
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="text-[10px] uppercase font-mono">
                  <TableHead>Zone ID</TableHead>
                  <TableHead>Estimated GPS</TableHead>
                  <TableHead>Uncertainty Radius</TableHead>
                  <TableHead>Confidence</TableHead>
                  <TableHead>Residual Error</TableHead>
                  <TableHead>Contributing Sensors</TableHead>
                  <TableHead>Timestamp</TableHead>
                  <TableHead className="text-right">Provenance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="text-xs font-mono">
                {k.zones.map((z) => (
                  <TableRow key={z.id} className="hover:bg-secondary/40">
                    <TableCell className="font-bold text-warning">ZONE {z.id}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {z.lat.toFixed(5)}°, {z.lon.toFixed(5)}°
                    </TableCell>
                    <TableCell className="font-bold text-foreground">±{z.radius} m</TableCell>
                    <TableCell className="text-primary font-bold">{z.confidence ?? 0}%</TableCell>
                    <TableCell className="text-muted-foreground">
                      {z.residual?.toFixed(1) ?? "0.0"} m
                    </TableCell>
                    <TableCell className="text-foreground text-[11px]">
                      {z.contributingNodes?.join(", ") || "N01, N02, N03"}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-[11px]">
                      {new Date(z.ts).toLocaleTimeString("en-GB")}
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge variant="outline" className="text-[9px] uppercase">
                        {z.sourceMode === "live" ? "LIVE HARDWARE" : "SIMULATION"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
                {k.zones.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={8}
                      className="text-center py-6 text-xs text-muted-foreground"
                    >
                      No localization search zones recorded. Run multilateration in Command Center
                      or Live Map.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* =========================================================================
         SUBTAB 3: AUDIT EVENTS LOG
         ========================================================================= */}
      {subTab === "events" && (
        <div className="panel p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-2.5">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-foreground flex items-center gap-2">
              <ScrollText size={14} className="text-primary" />
              Immutable Application Audit Log ({filteredEvents.length})
            </h2>

            <div className="flex items-center gap-2">
              <Input
                placeholder="Filter events by keyword..."
                value={eventFilter}
                onChange={(e) => setEventFilter(e.target.value)}
                className="h-7 w-56 text-xs font-mono"
              />
            </div>
          </div>

          <div className="overflow-x-auto max-h-[500px] overflow-y-auto trace-scroll">
            <Table>
              <TableHeader>
                <TableRow className="text-[10px] uppercase font-mono">
                  <TableHead>Time</TableHead>
                  <TableHead>Event Type</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Description</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="text-xs font-mono">
                {filteredEvents.map((evt: AppEvent) => (
                  <TableRow key={evt.id} className="hover:bg-secondary/40">
                    <TableCell className="text-muted-foreground whitespace-nowrap text-[11px]">
                      {new Date(evt.ts).toLocaleTimeString("en-GB")}
                    </TableCell>
                    <TableCell className="font-bold text-foreground">{evt.type}</TableCell>
                    <TableCell>
                      <SeverityBadge severity={evt.severity} />
                    </TableCell>
                    <TableCell className="text-primary text-[11px]">{evt.source}</TableCell>
                    <TableCell className="text-foreground">{evt.message}</TableCell>
                  </TableRow>
                ))}
                {filteredEvents.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="text-center py-6 text-xs text-muted-foreground"
                    >
                      No matching audit events found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* =========================================================================
         SUBTAB 4: OPERATIONAL MISSION REPORT & EXPORT
         ========================================================================= */}
      {subTab === "reports" && (
        <div className="space-y-4 print-report">
          <div className="panel p-4 space-y-3 bg-card/80">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
              <div>
                <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
                  <FileText size={15} className="text-primary" />
                  Tactical Incident Mission Report
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Generated operational documentation, node deployment statistics, and derived search areas
                </p>
              </div>

              <div className="flex items-center gap-2 no-print">
                <select
                  aria-label="Filter report by incident"
                  value={selectedIncidentId}
                  onChange={(e) => setSelectedIncidentId(e.target.value)}
                  className="border border-border bg-background px-2.5 h-8 rounded text-xs text-foreground outline-none font-mono"
                >
                  {k.incidents.map((inc) => (
                    <option key={inc.id} value={inc.id}>
                      {inc.name} ({inc.id})
                    </option>
                  ))}
                </select>

                <select
                  aria-label="Report time range"
                  value={reportRange}
                  onChange={(e) => setReportRange(e.target.value)}
                  className="border border-border bg-background px-2.5 h-8 rounded text-xs text-foreground outline-none font-mono"
                >
                  <option value="all">Full Operational Session</option>
                  <option value="5">Last 5 Minutes</option>
                  <option value="30">Last 30 Minutes</option>
                  <option value="120">Last 2 Hours</option>
                </select>

                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs gap-1.5"
                  onClick={() => window.print()}
                >
                  <Printer size={13} />
                  Print / Save PDF
                </Button>

                <Button
                  size="sm"
                  className="h-8 text-xs gap-1.5"
                  onClick={() => {
                    const inc = selectedIncident || {
                      id: "INC-001",
                      name: "General Disaster Response",
                      status: "active" as const,
                      disaster: "Structural Collapse",
                      location: "Operational Sector A",
                      commander: "Field Team",
                      notes: "",
                      created: Date.now(),
                      timeline: [],
                    };
                    const headers = ["Category", "ID", "Name_or_Title", "Status", "Details", "Timestamp"];
                    const rows = [
                      ["Incident", inc.id, inc.name, inc.status, `${inc.disaster} @ ${inc.location}`, new Date(inc.created).toISOString()],
                      ...k.nodes.map((n) => ["Sensor Node", n.id, n.label, n.status, `Battery: ${n.battery}%, RSSI: ${n.rssi} dBm, GPS: ${n.lat?.toFixed(5) ?? "N/A"}, ${n.lon?.toFixed(5) ?? "N/A"}`, new Date(n.lastPacket || Date.now()).toISOString()]),
                      ...k.zones.map((z) => ["Search Zone", z.id, `Zone ${z.id}`, (z.confidence ?? 0) >= 50 ? "High Priority" : "Moderate", `Radius: ±${z.radius}m, Residual: ${z.residual?.toFixed(1) ?? "0.0"}m, Nodes: ${z.contributingNodes.join(", ")}`, new Date(z.ts).toISOString()]),
                      ...k.operations.map((o) => ["Rescue Operation", o.id, o.title, o.status, `Sector: ${o.sector}, Confirmed: ${o.confirmedPeople}, Rescued: ${o.rescuedCount}, Awaiting: ${o.awaitingRescue}`, new Date(o.reportedAt).toISOString()]),
                    ];
                    exportCsv(`trace_report_${inc.id}_${Date.now()}`, headers, rows);
                  }}
                >
                  <Download size={13} />
                  Export Full CSV
                </Button>
              </div>
            </div>

            {/* KPI Summary Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs pt-1">
              <div className="panel p-3 bg-background/50">
                <span className="trace-label text-[9px]">INCIDENT STATUS</span>
                <p className="font-bold text-foreground text-sm uppercase mt-0.5">{selectedIncident?.status ?? "ACTIVE"}</p>
                <p className="text-[10px] text-muted-foreground">{selectedIncident?.disaster ?? "Operational Incident"}</p>
              </div>
              <div className="panel p-3 bg-background/50">
                <span className="trace-label text-[9px]">ACTIVE NODES</span>
                <p className="font-bold text-primary text-sm font-mono mt-0.5">{k.nodes.filter(n => n.status !== "offline").length} / {k.nodes.length} Online</p>
                <p className="text-[10px] text-muted-foreground">{k.gatewayConnected ? "Gateway Online" : "Gateway Offline"}</p>
              </div>
              <div className="panel p-3 bg-background/50">
                <span className="trace-label text-[9px]">SEARCH ZONES DERIVED</span>
                <p className="font-bold text-warning text-sm font-mono mt-0.5">{k.zones.length} Zones</p>
                <p className="text-[10px] text-muted-foreground">{k.zones.length > 0 ? `Avg Radius: ±${Math.round(k.zones.reduce((a, z) => a + z.radius, 0) / k.zones.length)}m` : "None calculated"}</p>
              </div>
              <div className="panel p-3 bg-background/50">
                <span className="trace-label text-[9px]">RESCUE MISSIONS</span>
                <p className="font-bold text-emerald-400 text-sm font-mono mt-0.5">{k.operations.length} Missions</p>
                <p className="text-[10px] text-muted-foreground">{k.operations.filter(o => o.status === "Rescue In Progress" || o.status === "Under Investigation").length} In Progress</p>
              </div>
            </div>
          </div>

          {/* Section: Sensor Nodes Inventory */}
          <div className="panel p-4 space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground flex items-center justify-between pb-2 border-b border-border">
              <span>Deployed Receiver Nodes Inventory</span>
              <Badge variant="outline" className="text-[9px] font-mono">{k.nodes.length} Stations</Badge>
            </h3>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="text-[10px] uppercase font-mono">
                    <TableHead>Station ID</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Surveyed Coordinates</TableHead>
                    <TableHead>Battery</TableHead>
                    <TableHead>Signal Link</TableHead>
                    <TableHead>Packets Recv/Lost</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="text-xs font-mono">
                  {k.nodes.map((n) => (
                    <TableRow key={n.id}>
                      <TableCell className="font-bold text-foreground">{n.id}</TableCell>
                      <TableCell className="uppercase text-[11px] text-muted-foreground">{n.type}</TableCell>
                      <TableCell>
                        <span className={cn("px-2 py-0.5 rounded text-[10px] font-semibold", n.status === "online" ? "bg-success/15 text-success border border-success/30" : "bg-critical/15 text-critical border border-critical/30")}>
                          {n.status.toUpperCase()}
                        </span>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-[11px]">
                        {n.lat != null && n.lon != null ? `${n.lat.toFixed(5)}°, ${n.lon.toFixed(5)}°` : "Location Unset"}
                      </TableCell>
                      <TableCell className={cn(n.battery < 20 ? "text-critical font-bold" : "text-foreground")}>
                        {n.battery.toFixed(0)}%
                      </TableCell>
                      <TableCell className="text-primary font-bold">{n.rssi ? `${n.rssi.toFixed(0)} dBm` : "--"}</TableCell>
                      <TableCell className="text-muted-foreground">{n.packetsReceived ?? 0} / {n.packetsLost ?? 0}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          {/* Section: Derived Search Areas */}
          <div className="panel p-4 space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground flex items-center justify-between pb-2 border-b border-border">
              <span>Multilateration Search Area Estimates</span>
              <Badge variant="outline" className="text-[9px] font-mono text-warning border-warning/40">{k.zones.length} Areas</Badge>
            </h3>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="text-[10px] uppercase font-mono">
                    <TableHead>Zone ID</TableHead>
                    <TableHead>Estimated Center</TableHead>
                    <TableHead>Uncertainty Radius</TableHead>
                    <TableHead>Confidence</TableHead>
                    <TableHead>Residual Fit</TableHead>
                    <TableHead>Contributing Anchors</TableHead>
                    <TableHead>Data Provenance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="text-xs font-mono">
                  {k.zones.map((z) => (
                    <TableRow key={z.id}>
                      <TableCell className="font-bold text-foreground">{z.id}</TableCell>
                      <TableCell className="text-primary font-bold">
                        {z.lat != null && z.lon != null ? `${z.lat.toFixed(5)}°, ${z.lon.toFixed(5)}°` : "Estimated XY"}
                      </TableCell>
                      <TableCell className="font-bold text-foreground">±{z.radius} m</TableCell>
                      <TableCell className="text-warning font-bold">{z.confidence}%</TableCell>
                      <TableCell className="text-muted-foreground">{z.residual?.toFixed(1) ?? "0.0"} m</TableCell>
                      <TableCell className="text-foreground text-[11px]">{z.contributingNodes.join(", ") || "N01, N02, N03"}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[9px] uppercase">
                          {z.sourceMode === "live" ? "LIVE HARDWARE" : "SIMULATION"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                  {k.zones.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-6 text-xs text-muted-foreground">
                        No search zones calculated for this incident session yet.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>

          {/* Section: Known Physical Limitations Statement */}
          <div className="panel p-3.5 bg-warning/5 border-warning/30 space-y-1 text-xs text-warning">
            <div className="flex items-center gap-1.5 font-semibold text-[11px]">
              <AlertTriangle size={13} />
              Operational Evidence Statement & Limitations
            </div>
            <p className="text-[10px] text-warning/90 leading-relaxed">
              Signal detections and multilateration zones represent estimated physical RF transmitter locations. In collapsed structures, multipath reflections, concrete attenuation, and void geometry introduce non-line-of-sight path loss. An RF search zone does not constitute proof of human life without physical corroboration from search cameras, acoustic listening devices, or rescue canines.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
