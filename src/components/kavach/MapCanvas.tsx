import { useId, useRef, useState, useMemo } from "react";
import {
  Crosshair,
  Layers,
  Minus,
  Plus,
  RadioTower,
  ShieldAlert,
  AlertTriangle,
  X,
  Target,
  Maximize2,
  Navigation,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { M_PER_DEG_LAT, mPerDegLon, rssiToDistance } from "@/lib/kavach/engine";
import { SITE_ORIGIN, useKavach } from "@/lib/kavach/store";
import type { CalibrationSettings, SearchZone, SensorNode } from "@/lib/kavach/types";

export const localXY = (n: { lat?: number | null; lon?: number | null }, origin = SITE_ORIGIN) => {
  const lat = typeof n?.lat === "number" && Number.isFinite(n.lat) ? n.lat : origin.lat;
  const lon = typeof n?.lon === "number" && Number.isFinite(n.lon) ? n.lon : origin.lon;
  return {
    x: (lon - origin.lon) * mPerDegLon(origin.lat),
    y: (lat - origin.lat) * M_PER_DEG_LAT,
  };
};

export interface SelectedMapItem {
  kind: "incident" | "node" | "zone" | "gateway" | "signal";
  id: string;
  title: string;
  lat: number;
  lon: number;
  provenance: "LIVE HARDWARE" | "SIMULATION" | "MANUAL" | "CONFIGURED";
  details?: Record<string, string | number | undefined | null>;
}

export interface Props {
  nodes: SensorNode[];
  zones: SearchZone[];
  calibration: CalibrationSettings;
  selectedNode?: string | null;
  onSelectNode?: (id: string) => void;
  className?: string;
  editable?: boolean;
  showTruth?: boolean;
  onMoveSignal?: (x: number, y: number) => void;
}

export function MapCanvas({
  nodes,
  zones,
  calibration,
  selectedNode,
  onSelectNode,
  className,
  editable = false,
  showTruth = false,
  onMoveSignal,
}: Props) {
  const k = useKavach();
  const id = useId().replace(/:/g, "");
  const svg = useRef<SVGSVGElement>(null);

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [layers, setLayers] = useState({
    grid: true,
    rings: true,
    links: true,
    nodes: true,
    zones: true,
    incident: true,
  });
  const [menu, setMenu] = useState(false);
  const [selectedItem, setSelectedItem] = useState<SelectedMapItem | null>(null);

  const drag = useRef<{
    id: string | null;
    x: number;
    y: number;
    px: number;
    py: number;
    startX: number;
    startY: number;
  } | null>(null);

  // Active Incident Data
  const currentIncident = k.incidents.find((i) => i.id === k.incidentId);
  const incLat = currentIncident?.lat;
  const incLon = currentIncident?.lon;
  const incidentConfigured =
    currentIncident != null &&
    typeof incLat === "number" &&
    Number.isFinite(incLat) &&
    typeof incLon === "number" &&
    Number.isFinite(incLon);

  // Determine Tactical Center (Origin)
  const tacticalCenter = useMemo((): { lat: number; lon: number } => {
    if (incidentConfigured && incLat != null && incLon != null) {
      return { lat: incLat, lon: incLon };
    }
    // Fallback to centroid of reporting nodes if available
    const validNodes = nodes.filter(
      (n) =>
        typeof n.lat === "number" &&
        Number.isFinite(n.lat) &&
        typeof n.lon === "number" &&
        Number.isFinite(n.lon),
    );
    if (validNodes.length > 0) {
      const avgLat = validNodes.reduce((s, n) => s + n.lat, 0) / validNodes.length;
      const avgLon = validNodes.reduce((s, n) => s + n.lon, 0) / validNodes.length;
      return { lat: avgLat, lon: avgLon };
    }
    return SITE_ORIGIN;
  }, [incidentConfigured, incLat, incLon, nodes]);

  // Compute Tactical Field Bounding Box
  const { scale: baseScale, boundsWarning } = useMemo(() => {
    const points: { x: number; y: number }[] = [];

    // Always include origin at (0, 0)
    points.push({ x: 0, y: 0 });

    // Incident bounds
    if (incidentConfigured && currentIncident) {
      const r = currentIncident.radius_m || 250;
      points.push({ x: -r, y: -r }, { x: r, y: r });
    }

    // Nodes
    nodes.forEach((n) => {
      if (Number.isFinite(n.lat) && Number.isFinite(n.lon)) {
        const xy = localXY(n, tacticalCenter);
        points.push(xy);
      }
    });

    // Zones
    zones.forEach((z) => {
      if (Number.isFinite(z.lat) && Number.isFinite(z.lon)) {
        const xy = localXY(z, tacticalCenter);
        const r = z.radius || 40;
        points.push({ x: xy.x - r, y: xy.y - r }, { x: xy.x + r, y: xy.y + r });
      }
    });

    // Simulation synthetic signal
    if (k.mode === "simulation" && k.signal) {
      const sigLat = SITE_ORIGIN.lat + k.signal.y / M_PER_DEG_LAT;
      const sigLon = SITE_ORIGIN.lon + k.signal.x / mPerDegLon(SITE_ORIGIN.lat);
      points.push(localXY({ lat: sigLat, lon: sigLon }, tacticalCenter));
    }

    let minX = 0;
    let maxX = 0;
    let minY = 0;
    let maxY = 0;
    points.forEach((p) => {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    });

    const spanX = Math.max(240, (maxX - minX) * 1.35);
    const spanY = Math.max(180, (maxY - minY) * 1.35);

    // Uniform 1:1 scale (pixels per meter). SVG viewBox is 1000 x 700.
    const computedScale = Math.min(840 / spanX, 560 / spanY);
    // Safe clamp to avoid extreme zoom out or in
    const scale = Math.max(0.4, Math.min(3.5, computedScale));

    const warnings: string[] = [];
    if (!incidentConfigured) {
      warnings.push("Incident coordinates not configured. Displaying relative node centroid.");
    }
    const nodesWithoutGps = nodes.filter((n) => !Number.isFinite(n.lat) || !Number.isFinite(n.lon));
    if (nodesWithoutGps.length > 0) {
      warnings.push(`${nodesWithoutGps.length} device(s) awaiting valid GPS coordinates.`);
    }

    return { scale, boundsWarning: warnings };
  }, [incidentConfigured, currentIncident, nodes, zones, tacticalCenter, k.mode, k.signal]);

  // Unified projection function: (lat, lon) -> SVG Canvas (x, y)
  const project = (lat: number, lon: number) => {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return { x: 500, y: 350, dx: 0, dy: 0, dist: 0, isValid: false };
    }
    const dx = (lon - tacticalCenter.lon) * mPerDegLon(tacticalCenter.lat);
    const dy = (lat - tacticalCenter.lat) * M_PER_DEG_LAT;
    const currentScale = baseScale * zoom;
    return {
      x: 500 + dx * currentScale + pan.x,
      y: 350 - dy * currentScale + pan.y,
      dx,
      dy,
      dist: Math.hypot(dx, dy),
      isValid: true,
    };
  };

  const eventPoint = (e: React.PointerEvent<SVGSVGElement>) => {
    const el = svg.current;
    const matrix = el?.getScreenCTM();
    if (!el || !matrix) return null;
    return new DOMPoint(e.clientX, e.clientY).matrixTransform(matrix.inverse());
  };

  const gateway = nodes.find((n) => n.type === "gateway" || n.id === "N04" || n.id === "GW01");
  const incidentCenter = project(tacticalCenter.lat, tacticalCenter.lon);

  // Helper for selecting items
  const selectZone = (z: SearchZone) => {
    const p = project(z.lat, z.lon);
    setSelectedItem({
      kind: "zone",
      id: z.id,
      title: `Search Zone ${z.id}`,
      lat: z.lat,
      lon: z.lon,
      provenance: z.sourceMode === "live" ? "LIVE HARDWARE" : "SIMULATION",
      details: {
        "Uncertainty Radius": `±${z.radius} m`,
        Confidence: `${z.confidence ?? 0}%`,
        "Residual Error": `${z.residual?.toFixed(1) ?? "0.0"} m`,
        "Contributing Sensors": z.contributingNodes?.join(", ") || "None",
        "Distance from Command": `${p.dist.toFixed(1)} m (${p.dx >= 0 ? "+" : ""}${p.dx.toFixed(1)}m E, ${p.dy >= 0 ? "+" : ""}${p.dy.toFixed(1)}m N)`,
        Timestamp: new Date(z.ts).toLocaleTimeString("en-GB"),
      },
    });
  };

  const selectNode = (n: SensorNode) => {
    onSelectNode?.(n.id);
    const p = project(n.lat, n.lon);
    setSelectedItem({
      kind: n.type === "gateway" ? "gateway" : "node",
      id: n.id,
      title: `${n.label || n.id} (${n.type === "gateway" ? "Gateway" : "Sniffer"})`,
      lat: n.lat,
      lon: n.lon,
      provenance: k.mode === "live" ? "LIVE HARDWARE" : "SIMULATION",
      details: {
        Status: n.status.toUpperCase(),
        Battery: `${n.battery.toFixed(0)}%`,
        "LoRa RSSI": `${n.loraRssi?.toFixed(0) ?? "--"} dBm`,
        "Crowd RSSI": `${n.rssi?.toFixed(0) ?? "--"} dBm`,
        "GPS Mode": n.gpsFix ? `${n.gpsFix.toUpperCase()} Fix` : "Configured Anchor",
        "Distance from Command": `${p.dist.toFixed(1)} m`,
        "Last Seen": n.lastPacket
          ? `${Math.round((Date.now() - n.lastPacket) / 1000)}s ago`
          : "Awaiting data",
      },
    });
  };

  const selectIncident = () => {
    setSelectedItem({
      kind: "incident",
      id: currentIncident?.id || "INC-001",
      title: currentIncident?.name || "Tactical Command Area",
      lat: tacticalCenter.lat,
      lon: tacticalCenter.lon,
      provenance: "CONFIGURED",
      details: {
        Status: currentIncident?.status?.toUpperCase() || "ACTIVE",
        Disaster: currentIncident?.disaster || "Structural Collapse",
        Location: currentIncident?.location || "Field Operations Grid",
        Coordinates: `${tacticalCenter.lat.toFixed(6)}° N, ${tacticalCenter.lon.toFixed(6)}° E`,
        "Perimeter Radius": `${currentIncident?.radius_m || 250} m`,
      },
    });
  };

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-md bg-map-surface border border-border select-none",
        className,
      )}
    >
      {/* Top Left: Operational HUD */}
      <div className="absolute left-3 top-3 z-10 space-y-1 pointer-events-none">
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className={cn(
              "text-[9px] font-mono uppercase tracking-wider backdrop-blur-md",
              k.mode === "simulation"
                ? "bg-warning/15 text-warning border-warning/40"
                : "bg-primary/15 text-primary border-primary/40",
            )}
          >
            {k.mode === "simulation" ? "SIMULATION TELEMETRY" : "HARDWARE TELEMETRY"}
          </Badge>
          <span className="text-[10px] text-muted-foreground mono-num">
            Scale: 1m = {(baseScale * zoom).toFixed(2)}px
          </span>
        </div>
        <p className="text-xs font-semibold text-foreground tracking-tight flex items-center gap-1.5">
          <Navigation size={12} className="text-primary rotate-45" />
          {currentIncident?.name || "Disaster Response Sector"}
        </p>
        <p className="text-[10px] text-muted-foreground font-mono">
          Ref: {tacticalCenter.lat.toFixed(5)}° N, {tacticalCenter.lon.toFixed(5)}° E
        </p>

        {boundsWarning.length > 0 && (
          <div className="space-y-1 pt-1 max-w-xs">
            {boundsWarning.map((w, i) => (
              <div
                key={i}
                className="flex items-center gap-1.5 text-[9px] text-warning bg-card/90 border border-warning/30 px-2 py-0.5 rounded backdrop-blur-sm pointer-events-auto"
              >
                <AlertTriangle size={10} className="shrink-0" />
                <span>{w}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Top Right: Controls */}
      <div className="absolute right-3 top-3 z-10 flex gap-1 bg-card/95 p-1 rounded-md border border-border shadow-md">
        <Button
          variant="ghost"
          size="icon"
          title="Zoom In (+25%)"
          aria-label="Zoom In"
          className="h-7 w-7"
          onClick={() => setZoom((v) => Math.min(3.5, v + 0.25))}
        >
          <Plus size={14} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          title="Zoom Out (-25%)"
          aria-label="Zoom Out"
          className="h-7 w-7"
          onClick={() => setZoom((v) => Math.max(0.5, v - 0.25))}
        >
          <Minus size={14} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          title="Reset View & Fit All Elements"
          aria-label="Reset View"
          className="h-7 w-7"
          onClick={() => {
            setZoom(1);
            setPan({ x: 0, y: 0 });
          }}
        >
          <Crosshair size={14} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          title="Toggle Tactical Layers"
          aria-label="Toggle Tactical Layers"
          className={cn("h-7 w-7", menu && "bg-secondary text-foreground")}
          onClick={() => setMenu((v) => !v)}
        >
          <Layers size={14} />
        </Button>
      </div>

      {/* Layer Toggle Menu */}
      {menu && (
        <div className="absolute right-3 top-12 z-20 bg-card/95 border border-border rounded-md p-2.5 space-y-1.5 text-[11px] shadow-lg backdrop-blur-md min-w-44">
          <div className="text-[9px] uppercase tracking-wider font-semibold text-muted-foreground pb-1 border-b border-border">
            Map Display Layers
          </div>
          {Object.entries(layers).map(([key, v]) => (
            <label
              key={key}
              className="flex items-center justify-between gap-3 capitalize cursor-pointer hover:text-foreground text-muted-foreground"
            >
              <span>
                {key === "rings" ? "Distance Rings" : key === "links" ? "Radio Links" : key}
              </span>
              <input
                type="checkbox"
                checked={v}
                className="rounded border-border accent-primary cursor-pointer"
                onChange={(e) => setLayers((l) => ({ ...l, [key]: e.target.checked }))}
              />
            </label>
          ))}
        </div>
      )}

      {/* SVG Tactical Vector Map */}
      <svg
        ref={svg}
        viewBox="0 0 1000 700"
        preserveAspectRatio="xMidYMid slice"
        className="h-full w-full touch-none cursor-grab active:cursor-grabbing"
        role="img"
        aria-label="TRACE Unified Tactical Map"
        onPointerDown={(e) => {
          const point = eventPoint(e);
          if (!point) return;
          const marker = (e.target as Element).closest("[data-node]")?.getAttribute("data-node");
          const truth = (e.target as Element).closest("[data-truth]");
          drag.current = {
            id: editable ? (truth ? "truth" : (marker ?? null)) : null,
            x: point.x,
            y: point.y,
            px: pan.x,
            py: pan.y,
            startX: e.clientX,
            startY: e.clientY,
          };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          const point = eventPoint(e);
          if (!point) return;
          const currentScale = baseScale * zoom;
          if (d.id) {
            const dx = (point.x - 500 - pan.x) / currentScale;
            const dy = -(point.y - 350 - pan.y) / currentScale;
            if (d.id === "truth") onMoveSignal?.(dx, dy);
            else k.moveNode(d.id, dx, dy);
          } else {
            setPan({ x: d.px + point.x - d.x, y: d.py + point.y - d.y });
          }
        }}
        onPointerUp={(e) => {
          drag.current = null;
          if (e.currentTarget.hasPointerCapture(e.pointerId)) {
            e.currentTarget.releasePointerCapture(e.pointerId);
          }
        }}
      >
        <defs>
          <pattern id={`tactical-grid-${id}`} width="50" height="50" patternUnits="userSpaceOnUse">
            <path
              d="M50 0H0V50"
              fill="none"
              stroke="var(--grid-line)"
              strokeWidth="0.6"
              opacity="0.6"
            />
          </pattern>
          <radialGradient id={`zone-grad-${id}`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="var(--warning)" stopOpacity="0.25" />
            <stop offset="70%" stopColor="var(--warning)" stopOpacity="0.10" />
            <stop offset="100%" stopColor="var(--warning)" stopOpacity="0.0" />
          </radialGradient>
        </defs>

        {/* Tactical Grid Background */}
        {layers.grid && <rect width="1000" height="700" fill={`url(#tactical-grid-${id})`} />}

        {/* Concentric Distance Rings from Incident Command Center */}
        {layers.rings && incidentCenter.isValid && (
          <g stroke="var(--grid-line)" fill="none" strokeDasharray="3 6" opacity="0.45">
            {[50, 100, 200, 400].map((radiusM) => {
              const rPx = radiusM * baseScale * zoom;
              return (
                <g key={radiusM}>
                  <circle cx={incidentCenter.x} cy={incidentCenter.y} r={rPx} />
                  <text
                    x={incidentCenter.x + 6}
                    y={incidentCenter.y - rPx + 12}
                    fill="var(--muted-foreground)"
                    fontSize="9"
                    fontFamily="monospace"
                  >
                    {radiusM}m
                  </text>
                </g>
              );
            })}
          </g>
        )}

        {/* Center Crosshairs */}
        <path
          d={`M 0 ${incidentCenter.y} H 1000 M ${incidentCenter.x} 0 V 700`}
          stroke="var(--grid-line)"
          strokeDasharray="4 8"
          opacity="0.3"
        />

        {/* Incident Command Center Marker */}
        {layers.incident && incidentCenter.isValid && (
          <g
            className="cursor-pointer"
            onClick={selectIncident}
            role="button"
            aria-label="Inspect Incident Command"
          >
            {/* Tactical Perimeter */}
            <circle
              cx={incidentCenter.x}
              cy={incidentCenter.y}
              r={(currentIncident?.radius_m || 250) * baseScale * zoom}
              fill="var(--critical)"
              fillOpacity="0.03"
              stroke="var(--critical)"
              strokeWidth="1.2"
              strokeDasharray="4 4"
            />
            {/* Command Marker Icon */}
            <circle
              cx={incidentCenter.x}
              cy={incidentCenter.y}
              r="16"
              fill="var(--critical)"
              fillOpacity="0.15"
              stroke="var(--critical)"
              strokeWidth="1.5"
            />
            <path
              d={`M ${incidentCenter.x - 7} ${incidentCenter.y - 7} L ${incidentCenter.x + 7} ${incidentCenter.y + 7} M ${incidentCenter.x + 7} ${incidentCenter.y - 7} L ${incidentCenter.x - 7} ${incidentCenter.y + 7}`}
              stroke="var(--critical)"
              strokeWidth="2"
            />
            <text
              x={incidentCenter.x}
              y={incidentCenter.y - 22}
              textAnchor="middle"
              fill="var(--critical)"
              fontSize="11"
              fontFamily="monospace"
              fontWeight="bold"
            >
              ★ INCIDENT COMMAND
            </text>
          </g>
        )}

        {/* Radio Links between Gateway and Reporting Nodes */}
        {layers.links &&
          gateway &&
          nodes
            .filter((n) => n.id !== gateway.id && Number.isFinite(n.lat) && Number.isFinite(n.lon))
            .map((n) => {
              const pA = project(n.lat, n.lon);
              const pB = project(gateway.lat, gateway.lon);
              const ok = n.status !== "offline" && k.gatewayConnected;
              return (
                <g key={`link-${n.id}`}>
                  <line
                    x1={pA.x}
                    y1={pA.y}
                    x2={pB.x}
                    y2={pB.y}
                    stroke={ok ? "var(--primary)" : "var(--critical)"}
                    strokeOpacity="0.3"
                    strokeDasharray="4 4"
                  />
                  {ok && k.running && (
                    <line
                      x1={pA.x}
                      y1={pA.y}
                      x2={pB.x}
                      y2={pB.y}
                      stroke="var(--primary)"
                      strokeWidth="2"
                      className="packet-link"
                    />
                  )}
                  <text
                    x={(pA.x + pB.x) / 2}
                    y={(pA.y + pB.y) / 2 - 5}
                    fill="var(--muted-foreground)"
                    fontSize="9"
                    fontFamily="monospace"
                    textAnchor="middle"
                  >
                    {ok ? `${n.loraRssi?.toFixed(0) ?? "-95"} dBm` : "NO LINK"}
                  </text>
                </g>
              );
            })}

        {/* Estimated Search Areas (Uncertainty Zones) */}
        {layers.zones &&
          zones.map((z) => {
            const p = project(z.lat, z.lon);
            if (!p.isValid) return null;
            const rPx = (z.radius || 40) * baseScale * zoom;
            const isSelected = selectedItem?.kind === "zone" && selectedItem.id === z.id;

            return (
              <g
                key={`zone-${z.id}`}
                className="cursor-pointer"
                onClick={() => selectZone(z)}
                role="button"
                aria-label={`Inspect estimated search zone ${z.id}`}
              >
                {/* Radial Shaded Gradient Fill */}
                <circle cx={p.x} cy={p.y} r={rPx} fill={`url(#zone-grad-${id})`} />
                {/* Dashed Perimeter Ring (True Circular Radius) */}
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={rPx}
                  fill="none"
                  stroke="var(--warning)"
                  strokeWidth={isSelected ? "2.5" : "1.5"}
                  strokeDasharray="5 4"
                  className={isSelected ? "animate-pulse" : undefined}
                />
                {/* Confidence Inner Ring */}
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={rPx * 0.5}
                  fill="none"
                  stroke="var(--warning)"
                  strokeOpacity="0.4"
                  strokeDasharray="2 3"
                />
                {/* Center Target Indicator */}
                <circle cx={p.x} cy={p.y} r="4" fill="var(--warning)" />
                <path
                  d={`M ${p.x - 10} ${p.y} H ${p.x + 10} M ${p.x} ${p.y - 10} V ${p.y + 10}`}
                  stroke="var(--warning)"
                  strokeWidth="1.2"
                />
                {/* Tactical Label */}
                <text
                  x={p.x + rPx + 8}
                  y={p.y - 4}
                  fill="var(--warning)"
                  fontFamily="monospace"
                  fontSize="11"
                  fontWeight="bold"
                >
                  SEARCH AREA {z.id}
                </text>
                <text
                  x={p.x + rPx + 8}
                  y={p.y + 10}
                  fill="var(--muted-foreground)"
                  fontFamily="monospace"
                  fontSize="10"
                >
                  ±{z.radius}m · {z.confidence ?? 0}% Heuristic
                </text>
              </g>
            );
          })}

        {/* Nodes & Gateways */}
        {layers.nodes &&
          nodes
            .filter((n) => Number.isFinite(n.lat) && Number.isFinite(n.lon))
            .map((n) => {
              const p = project(n.lat, n.lon);
              const isGw = n.type === "gateway" || n.id === gateway?.id;
              const isSelected = selectedNode === n.id || selectedItem?.id === n.id;
              const isOffline = n.status === "offline";
              const color = isOffline ? "var(--critical)" : isGw ? "var(--info)" : "var(--primary)";

              return (
                <g
                  key={`node-${n.id}`}
                  data-node={n.id}
                  className="cursor-pointer"
                  onClick={() => selectNode(n)}
                  role="button"
                  aria-label={`Inspect ${isGw ? "Gateway" : "Sniffer"} ${n.id}`}
                >
                  {/* Selection & Pulse Aura */}
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={isGw ? 24 : 18}
                    fill={color}
                    fillOpacity="0.12"
                    stroke={color}
                    strokeWidth={isSelected ? 2 : 1}
                    strokeOpacity={isSelected ? 1 : 0.4}
                    className={!isOffline && k.running ? "node-ring" : undefined}
                  />

                  {/* Marker Shape: Square with Antenna for Gateway, Diamond for Sniffer */}
                  {isGw ? (
                    <g transform={`translate(${p.x - 10}, ${p.y - 10})`}>
                      <rect
                        width="20"
                        height="20"
                        rx="3"
                        fill="var(--map-surface)"
                        stroke={color}
                        strokeWidth="2"
                      />
                      <path
                        d="M 10 3 L 10 17 M 6 7 L 14 7 M 4 12 L 16 12"
                        stroke={color}
                        strokeWidth="1.5"
                      />
                    </g>
                  ) : (
                    <g transform={`translate(${p.x}, ${p.y}) rotate(45)`}>
                      <rect
                        x="-7"
                        y="-7"
                        width="14"
                        height="14"
                        rx="2"
                        fill="var(--map-surface)"
                        stroke={color}
                        strokeWidth="2"
                      />
                      <circle cx="0" cy="0" r="2.5" fill={color} />
                    </g>
                  )}

                  {/* Tag Label */}
                  <text
                    x={p.x}
                    y={p.y + (isGw ? 26 : 22)}
                    textAnchor="middle"
                    fill={color}
                    fontSize="11"
                    fontFamily="monospace"
                    fontWeight="bold"
                  >
                    {n.id}
                  </text>
                  <text
                    x={p.x}
                    y={p.y + (isGw ? 38 : 34)}
                    textAnchor="middle"
                    fill="var(--muted-foreground)"
                    fontSize="9"
                    fontFamily="monospace"
                  >
                    {isGw ? "GATEWAY" : `${n.battery.toFixed(0)}% · ${n.status}`}
                  </text>
                </g>
              );
            })}

        {/* Synthetic Target (Ground Truth - Simulation Mode Only) */}
        {showTruth &&
          k.mode === "simulation" &&
          k.signal &&
          (() => {
            const sigLat = SITE_ORIGIN.lat + k.signal.y / M_PER_DEG_LAT;
            const sigLon = SITE_ORIGIN.lon + k.signal.x / mPerDegLon(SITE_ORIGIN.lat);
            const p = project(sigLat, sigLon);
            return (
              <g data-truth="true" className="cursor-move">
                <circle
                  cx={p.x}
                  cy={p.y}
                  r="8"
                  fill="none"
                  stroke="var(--success)"
                  strokeWidth="2"
                />
                <circle cx={p.x} cy={p.y} r="2" fill="var(--success)" />
                <text
                  x={p.x + 12}
                  y={p.y + 4}
                  fontSize="10"
                  fontFamily="monospace"
                  fill="var(--success)"
                >
                  SYNTHETIC TARGET (SIM ONLY)
                </text>
              </g>
            );
          })()}

        {/* Compass & Graphic Scale Bar */}
        <g fontFamily="monospace" fontSize="10" fill="var(--muted-foreground)">
          <text x="25" y="635" fontWeight="bold">
            N ↑
          </text>
          {/* Dynamic 50-meter Graphic Bar */}
          {(() => {
            const barLenPx = 50 * baseScale * zoom;
            return (
              <g transform="translate(25, 655)">
                <path
                  d={`M 0 0 H ${barLenPx} M 0 -4 V 4 M ${barLenPx} -4 V 4`}
                  stroke="var(--foreground)"
                  strokeWidth="1.2"
                />
                <text x={barLenPx / 2} y="15" textAnchor="middle">
                  50 m
                </text>
              </g>
            );
          })()}
        </g>
      </svg>

      {/* Bottom Symbology Legend */}
      <div className="absolute bottom-2.5 left-1/2 -translate-x-1/2 flex flex-wrap items-center justify-center gap-3 text-[10px] text-muted-foreground bg-card/90 border border-border rounded-md px-3 py-1 shadow-sm backdrop-blur-xs whitespace-nowrap">
        <span className="flex items-center gap-1.5 text-critical">
          <span className="w-2 h-2 rounded-xs border border-critical bg-critical/20" /> Incident CMD
        </span>
        <span className="flex items-center gap-1.5 text-info">
          <span className="w-2 h-2 rounded-xs border border-info bg-info/20" /> Gateway
        </span>
        <span className="flex items-center gap-1.5 text-primary">
          <span className="w-2 h-2 rotate-45 border border-primary bg-primary/20" /> Sniffer Anchor
        </span>
        <span className="flex items-center gap-1.5 text-warning">
          <span className="w-2 h-2 rounded-full border border-dashed border-warning bg-warning/20" />{" "}
          Search Zone (Probable)
        </span>
      </div>

      {/* Selected Item Floating Inspector Card */}
      {selectedItem && (
        <div className="absolute bottom-12 right-3 bg-card/95 border border-primary/40 p-3 rounded-md text-xs max-w-72 shadow-xl backdrop-blur-md space-y-2 z-30 animate-in fade-in-50">
          <div className="flex items-start justify-between gap-2 border-b border-border pb-1.5">
            <div>
              <p className="font-bold text-foreground text-xs">{selectedItem.title}</p>
              <Badge variant="outline" className="text-[9px] uppercase font-mono mt-0.5">
                {selectedItem.provenance}
              </Badge>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5 text-muted-foreground hover:text-foreground"
              onClick={() => setSelectedItem(null)}
            >
              <X size={12} />
            </Button>
          </div>

          <div className="space-y-1 text-[11px] font-mono">
            <p className="text-muted-foreground">
              GPS:{" "}
              <span className="text-foreground">
                {selectedItem.lat.toFixed(6)}°, {selectedItem.lon.toFixed(6)}°
              </span>
            </p>
            {selectedItem.details &&
              Object.entries(selectedItem.details).map(([k, v]) => (
                <p key={k} className="flex justify-between gap-2 text-muted-foreground">
                  <span>{k}:</span>
                  <span className="text-foreground font-medium text-right truncate">
                    {v ?? "N/A"}
                  </span>
                </p>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
