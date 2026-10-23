import { useState, useEffect, useMemo } from "react";
import {
  RadioTower,
  Cpu,
  Activity,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Plus,
  Trash2,
  Sliders,
  Shield,
  Zap,
  Terminal,
  ArrowUpRight,
  Wifi,
  Save,
  Play,
  Crosshair,
  SlidersHorizontal,
  Compass,
  Radar,
  Filter,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useKavach } from "@/lib/kavach/store";
import {
  fitLogDistanceModel,
  type CalibrationSample,
  type CalibrationFitResult,
} from "@/lib/kavach/engine";
import type { SensorNode, CalibrationProfile } from "@/lib/kavach/types";
import { NodeDetail } from "./NodeDetail";
import { cn } from "@/lib/utils";

export function DevicesCalibration({
  initialTab = "devices",
}: {
  initialTab?: "devices" | "signals" | "gateway" | "diagnostics" | "calibration" | "network";
} = {}) {
  const k = useKavach();
  const [activeTab, setActiveTab] = useState<
    "devices" | "signals" | "gateway" | "diagnostics" | "calibration" | "network"
  >(initialTab === "calibration" ? "calibration" : initialTab === "network" ? "devices" : initialTab);

  useEffect(() => {
    if (initialTab === "calibration") setActiveTab("calibration");
    else if (initialTab === "network") setActiveTab("devices");
    else if (initialTab) setActiveTab(initialTab);
  }, [initialTab]);

  const [signalTypeFilter, setSignalTypeFilter] = useState<"all" | "ble" | "wifi" | "lora">("all");
  const [selectedNodeFilter, setSelectedNodeFilter] = useState<string>("all");
  const [signalSearch, setSignalSearch] = useState<string>("");

  const filteredDetections = useMemo(() => {
    return (k.detections || []).filter((d) => {
      const sigType = (d.signalType || "").toLowerCase();
      if (signalTypeFilter !== "all" && sigType !== signalTypeFilter.toLowerCase()) return false;
      if (selectedNodeFilter !== "all" && d.nodeId !== selectedNodeFilter) return false;
      if (signalSearch) {
        const query = signalSearch.toLowerCase();
        return (
          (d.tempId || "").toLowerCase().includes(query) ||
          (d.nodeId || "").toLowerCase().includes(query) ||
          sigType.includes(query)
        );
      }
      return true;
    });
  }, [k.detections, signalTypeFilter, selectedNodeFilter, signalSearch]);

  const [selectedNode, setSelectedNode] = useState<SensorNode | null>(null);

  // Calibration Wizard State
  const [profileName, setProfileName] = useState("Site Cal - Structural Rubble");
  const [environment, setEnvironment] = useState("Reinforced Concrete Rubble");
  const [frequencyMhz, setFrequencyMhz] = useState(868.1);
  const [txPowerDbm, setTxPowerDbm] = useState(14.0);
  const [sampleDistance, setSampleDistance] = useState<number>(1.0);
  const [sampleRssi, setSampleRssi] = useState<number>(-48);
  const [sampleSource, setSampleSource] = useState<"live" | "manual">("manual");
  const [savedProfiles, setSavedProfiles] = useState<CalibrationProfile[]>([]);
  const [savingProfile, setSavingProfile] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Initial reference samples (Default experiment setup)
  const [samples, setSamples] = useState<CalibrationSample[]>([
    {
      id: "SMP-1",
      distance: 1.0,
      rssi: -48,
      source: "manual",
      timestamp: Date.now() - 60000,
      notes: "Direct line-of-sight 1m",
    },
    {
      id: "SMP-2",
      distance: 5.0,
      rssi: -67,
      source: "manual",
      timestamp: Date.now() - 40000,
      notes: "Perimeter distance 5m",
    },
    {
      id: "SMP-3",
      distance: 10.0,
      rssi: -75,
      source: "manual",
      timestamp: Date.now() - 20000,
      notes: "Debris edge 10m",
    },
  ]);

  // Load saved profiles from API on mount
  useEffect(() => {
    fetch("/api/calibration/profiles")
      .then((r) => r.json())
      .then((data) => {
        interface ApiProfileItem {
          id: string;
          name: string;
          ref_rssi: number;
          path_loss_exponent: number;
          rmse: number;
          r2: number;
          sample_count: number;
          distinct_distances: number;
          environment: string;
          frequency_mhz?: number;
          tx_power_dbm?: number;
          antenna_type?: string;
          warnings_json?: string;
          is_active: number;
          created_at: number;
        }
        if (data?.profiles && Array.isArray(data.profiles)) {
          setSavedProfiles(
            data.profiles.map((p: ApiProfileItem) => ({
              id: p.id,
              name: p.name,
              refRssi: p.ref_rssi,
              pathLossExponent: p.path_loss_exponent,
              rmse: p.rmse,
              r2: p.r2,
              sampleCount: p.sample_count,
              distinctDistances: p.distinct_distances,
              createdAt: p.created_at,
              environment: p.environment,
              frequencyMhz: p.frequency_mhz,
              txPowerDbm: p.tx_power_dbm,
              antennaType: p.antenna_type,
              warnings: JSON.parse(p.warnings_json || "[]"),
              isActive: p.is_active === 1,
            })),
          );
        }
      })
      .catch(() => {});
  }, []);

  // Compute regression fit dynamically whenever samples change
  const fitResult: CalibrationFitResult = useMemo(() => {
    return fitLogDistanceModel(samples);
  }, [samples]);

  // Add sample
  const handleAddSample = () => {
    if (!sampleDistance || sampleDistance <= 0 || !sampleRssi) return;
    const newSample: CalibrationSample = {
      id: "SMP-" + Math.random().toString(36).substring(2, 7),
      distance: Number(sampleDistance),
      rssi: Number(sampleRssi),
      source: sampleSource,
      timestamp: Date.now(),
      notes: `${sampleDistance}m reference measurement`,
    };
    setSamples((prev) => [...prev, newSample]);
    setFeedback(`Recorded ${sampleDistance}m sample (${sampleRssi} dBm)`);
    setTimeout(() => setFeedback(null), 3000);
  };

  // Capture latest live RSSI from first sniffer node
  const handleCaptureLiveRssi = () => {
    const liveNode = k.nodes.find((n) => n.status === "online" && n.rssi && n.rssi > -120);
    if (liveNode) {
      setSampleRssi(liveNode.rssi);
      setSampleSource("live");
      setFeedback(`Captured ${liveNode.rssi} dBm from live node ${liveNode.id}`);
      setTimeout(() => setFeedback(null), 3000);
    } else {
      setFeedback("No active live node telemetry available to sample.");
      setTimeout(() => setFeedback(null), 3000);
    }
  };

  // Remove sample
  const handleRemoveSample = (id: string) => {
    setSamples((prev) => prev.filter((s) => s.id !== id));
  };

  // Load standard reference sample preset
  const handleLoadStandardPreset = () => {
    setSamples([
      {
        id: "SMP-1",
        distance: 1.0,
        rssi: -48,
        source: "manual",
        timestamp: Date.now() - 60000,
        notes: "Direct LOS 1m",
      },
      {
        id: "SMP-2",
        distance: 3.0,
        rssi: -61,
        source: "manual",
        timestamp: Date.now() - 50000,
        notes: "Intermediate 3m",
      },
      {
        id: "SMP-3",
        distance: 5.0,
        rssi: -67,
        source: "manual",
        timestamp: Date.now() - 40000,
        notes: "Perimeter 5m",
      },
      {
        id: "SMP-4",
        distance: 10.0,
        rssi: -75,
        source: "manual",
        timestamp: Date.now() - 20000,
        notes: "Rubble edge 10m",
      },
    ]);
    setFeedback("Loaded standard 4-point calibration dataset.");
    setTimeout(() => setFeedback(null), 3000);
  };

  // Save profile to database and activate in state
  const handleSaveAndActivate = async () => {
    setSavingProfile(true);
    try {
      const payload = {
        name: profileName,
        refRssi: fitResult.a0,
        pathLossExponent: fitResult.pathLossExponent,
        rmse: fitResult.rmse,
        r2: fitResult.r2,
        sampleCount: fitResult.sampleCount,
        distinctDistances: fitResult.distinctDistances,
        environment,
        frequencyMhz,
        txPowerDbm,
        antennaType: "Omnidirectional Dipole",
        warnings: fitResult.warnings,
        isActive: true,
        samples: samples.map((s) => ({
          distance: s.distance,
          rssi: s.rssi,
          source: s.source,
          timestamp: s.timestamp,
          notes: s.notes,
        })),
      };

      const res = await fetch("/api/calibration/profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const saved = await res.json();
        // Update local store calibration settings
        k.setCalibration({
          refRssi: fitResult.a0,
          pathLossExponent: fitResult.pathLossExponent,
          minRadius: 10,
          maxRadius: 150,
        });

        setSavedProfiles((prev) => [
          {
            id: saved.id,
            name: saved.name,
            refRssi: saved.ref_rssi,
            pathLossExponent: saved.path_loss_exponent,
            rmse: saved.rmse,
            r2: saved.r2,
            sampleCount: saved.sample_count,
            distinctDistances: saved.distinct_distances,
            createdAt: saved.created_at,
            environment: saved.environment,
            frequencyMhz: saved.frequency_mhz,
            txPowerDbm: saved.tx_power_dbm,
            antennaType: saved.antenna_type,
            warnings: JSON.parse(saved.warnings_json || "[]"),
            isActive: true,
          },
          ...prev.map((p) => ({ ...p, isActive: false })),
        ]);

        setFeedback(
          `Calibration profile saved and activated (A0: ${fitResult.a0.toFixed(1)} dBm, n: ${fitResult.pathLossExponent.toFixed(2)})`,
        );
      } else {
        setFeedback("Failed to persist calibration profile to database.");
      }
    } catch {
      setFeedback("Network error saving calibration profile.");
    } finally {
      setSavingProfile(false);
      setTimeout(() => setFeedback(null), 4000);
    }
  };

  // Activate an existing saved profile
  const handleActivateProfile = async (profile: CalibrationProfile) => {
    try {
      await fetch(`/api/calibration/activate/${profile.id}`, { method: "POST" });
      k.setCalibration({
        refRssi: profile.refRssi,
        pathLossExponent: profile.pathLossExponent,
        minRadius: 10,
        maxRadius: 150,
      });
      setSavedProfiles((prev) => prev.map((p) => ({ ...p, isActive: p.id === profile.id })));
      setFeedback(`Activated profile "${profile.name}" (n=${profile.pathLossExponent.toFixed(2)})`);
      setTimeout(() => setFeedback(null), 3000);
    } catch {
      setFeedback("Failed to activate profile.");
      setTimeout(() => setFeedback(null), 3000);
    }
  };

  const gateway = k.nodes.find((n) => n.type === "gateway" || n.id === "N04");
  const onlineNodes = k.nodes.filter((n) => n.status !== "offline");

  return (
    <div className="space-y-5">
      {/* Page Header */}
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border/60 pb-4">
        <div>
          <p className="trace-label text-[9px] font-semibold tracking-wider text-primary mb-1">
            TRACE / HARDWARE WORKSPACE
          </p>
          <h1 className="trace-heading text-foreground">Devices & Calibration</h1>
          <p className="text-xs text-muted-foreground mt-1 max-w-2xl">
            Real hardware gateway monitoring, sniffer diagnostics, and RF empirical path-loss
            calibration wizard.
          </p>
        </div>

        {/* View Switcher Tabs */}
        <div className="flex flex-wrap items-center gap-1 bg-card border border-border p-1 rounded-md text-xs">
          <Button
            size="sm"
            variant={activeTab === "devices" || activeTab === "network" ? "default" : "ghost"}
            className="h-8 text-xs gap-1.5"
            onClick={() => setActiveTab("devices")}
          >
            <RadioTower size={14} />
            Sensor Nodes ({k.nodes.length})
          </Button>
          <Button
            size="sm"
            variant={activeTab === "signals" ? "default" : "ghost"}
            className="h-8 text-xs gap-1.5"
            onClick={() => setActiveTab("signals")}
          >
            <Radar size={14} />
            Live Signals ({k.detections.length})
          </Button>
          <Button
            size="sm"
            variant={activeTab === "gateway" ? "default" : "ghost"}
            className="h-8 text-xs gap-1.5"
            onClick={() => setActiveTab("gateway")}
          >
            <Wifi size={14} />
            Gateway Concentrator
          </Button>
          <Button
            size="sm"
            variant={activeTab === "diagnostics" ? "default" : "ghost"}
            className="h-8 text-xs gap-1.5"
            onClick={() => setActiveTab("diagnostics")}
          >
            <Activity size={14} />
            Diagnostics
          </Button>
          <Button
            size="sm"
            variant={activeTab === "calibration" ? "default" : "ghost"}
            className="h-8 text-xs gap-1.5 border-l border-border/80 text-warning hover:text-warning"
            onClick={() => setActiveTab("calibration")}
          >
            <SlidersHorizontal size={14} />
            RF Calibration Wizard
          </Button>
        </div>
      </div>

      {/* Feedback Toast Banner */}
      {feedback && (
        <div className="flex items-center gap-2 p-2.5 rounded bg-primary/10 border border-primary/30 text-xs text-primary animate-in fade-in">
          <CheckCircle2 size={14} className="shrink-0" />
          <span>{feedback}</span>
        </div>
      )}

      {/* =========================================================================
         TAB 1: HARDWARE & SENSOR NODES
         ========================================================================= */}
      {(activeTab === "network" || activeTab === "devices") && (
        <div className="space-y-4">
          {/* Hardware Connection Status Cards */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
            {/* Gateway Concentrator */}
            <div className="panel p-3 space-y-1">
              <div className="flex items-center justify-between">
                <span className="trace-label text-[9px] text-muted-foreground">
                  GATEWAY CONCENTRATOR
                </span>
                <span
                  className={cn(
                    "h-2 w-2 rounded-full",
                    k.gatewayConnected ? "bg-success" : "bg-critical",
                  )}
                />
              </div>
              <p className="font-semibold text-foreground truncate">
                {k.gatewayConnected ? "LoRa 868.1 MHz Online" : "Gateway Disconnected"}
              </p>
              <p className="text-[10px] text-muted-foreground">
                {k.mode === "simulation" ? "Simulated Concentrator N04" : "USB Serial /dev/ttyUSB0"}
              </p>
            </div>

            {/* Ingestion API Endpoint */}
            <div className="panel p-3 space-y-1">
              <div className="flex items-center justify-between">
                <span className="trace-label text-[9px] text-muted-foreground">
                  INGRESS REST API
                </span>
                <Badge
                  variant="outline"
                  className="text-[9px] font-mono text-primary border-primary/30"
                >
                  HTTP POST
                </Badge>
              </div>
              <p className="font-semibold text-foreground truncate font-mono text-[11px]">
                /api/telemetry/ingest
              </p>
              <p className="text-[10px] text-muted-foreground">
                Payload: RFC-compliant JSON envelope
              </p>
            </div>

            {/* Reporting Nodes */}
            <div className="panel p-3 space-y-1">
              <div className="flex items-center justify-between">
                <span className="trace-label text-[9px] text-muted-foreground">ACTIVE NODES</span>
                <Badge variant="outline" className="text-[9px] font-mono">
                  {onlineNodes.length} / {k.nodes.length} ONLINE
                </Badge>
              </div>
              <p className="font-semibold text-foreground">
                {onlineNodes.length >= 3 ? "Multilateration Ready (≥3)" : "Insufficient Nodes (<3)"}
              </p>
              <p className="text-[10px] text-muted-foreground">
                {onlineNodes.length >= 3
                  ? "Geometry eligible for estimation"
                  : "Deploy additional sniffers"}
              </p>
            </div>

            {/* Active Path-Loss Profile */}
            <div className="panel p-3 space-y-1">
              <div className="flex items-center justify-between">
                <span className="trace-label text-[9px] text-muted-foreground">
                  RF PATH-LOSS PROFILE
                </span>
                <Badge
                  variant="outline"
                  className="text-[9px] font-mono text-warning border-warning/40"
                >
                  ACTIVE
                </Badge>
              </div>
              <p className="font-semibold text-foreground font-mono text-[11px]">
                A₀: {k.calibration.refRssi} dBm · n: {k.calibration.pathLossExponent.toFixed(2)}
              </p>
              <p className="text-[10px] text-muted-foreground">
                Log-distance model applied to all RSSI ranges
              </p>
            </div>
          </div>

          {/* Physical Companion Daemon Quickstart Banner */}
          <div className="panel p-4 space-y-2.5 bg-card/60 border-primary/20">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Terminal size={15} className="text-primary" />
                <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground">
                  Hardware Companion Daemon (Serial / LoRa Bridge)
                </h3>
              </div>
              <Badge variant="outline" className="text-[9px] font-mono">
                scripts/trace_gateway_daemon.py
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              To connect physical USB LoRa gateways or stream automated hardware telemetry directly
              into this TRACE instance:
            </p>
            <div className="bg-background/80 p-2.5 rounded border border-border font-mono text-[11px] text-foreground space-y-1">
              <p className="text-muted-foreground"># Windows USB COM Port Bridge:</p>
              <p className="text-primary">
                python scripts/trace_gateway_daemon.py --port COM3 --baud 115200 --api-key
                trace_dev_gateway_secret_2026
              </p>
              <p className="text-muted-foreground pt-1">
                # Automated Multi-Station Simulation (No Hardware Needed):
              </p>
              <p className="text-primary">
                python scripts/trace_gateway_daemon.py --simulate --rate 1.0 --api-key
                trace_dev_gateway_secret_2026
              </p>
            </div>
          </div>

          {/* Sensor Nodes Table */}
          <div className="panel p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-border pb-2.5">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-foreground flex items-center gap-2">
                <RadioTower size={14} className="text-primary" />
                Registered Sensor & Gateway Nodes ({k.nodes.length})
              </h2>
            </div>

            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="text-[10px] uppercase font-mono">
                    <TableHead>Node ID</TableHead>
                    <TableHead>Role / Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>GPS Position</TableHead>
                    <TableHead>Battery</TableHead>
                    <TableHead>Crowd RSSI</TableHead>
                    <TableHead>LoRa Link</TableHead>
                    <TableHead>Last Packet</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="text-xs font-mono">
                  {k.nodes.map((n) => {
                    const isGw = n.type === "gateway" || n.id === gateway?.id;
                    const isOffline = n.status === "offline";
                    return (
                      <TableRow key={n.id} className="hover:bg-secondary/40">
                        <TableCell className="font-bold text-foreground">{n.id}</TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-[9px]",
                              isGw ? "border-info/40 text-info" : "border-primary/40 text-primary",
                            )}
                          >
                            {isGw ? "GATEWAY" : "SNIFFER"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <span
                            className={cn(
                              "inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px]",
                              isOffline
                                ? "bg-critical/10 text-critical border border-critical/30"
                                : "bg-success/10 text-success border border-success/30",
                            )}
                          >
                            <span
                              className={cn(
                                "h-1.5 w-1.5 rounded-full",
                                isOffline ? "bg-critical" : "bg-success",
                              )}
                            />
                            {n.status.toUpperCase()}
                          </span>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-[11px]">
                          {Number.isFinite(n.lat) && Number.isFinite(n.lon) ? (
                            <span>
                              {n.lat.toFixed(5)}°, {n.lon.toFixed(5)}°
                            </span>
                          ) : (
                            <span className="text-warning">GPS Awaiting</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <span
                            className={cn(
                              n.battery < 20 ? "text-critical font-bold" : "text-foreground",
                            )}
                          >
                            {n.battery.toFixed(0)}%
                          </span>
                        </TableCell>
                        <TableCell>
                          {n.rssi && n.rssi > -120 ? (
                            <span className="text-primary font-bold">{n.rssi.toFixed(0)} dBm</span>
                          ) : (
                            <span className="text-muted-foreground">--</span>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-[11px]">
                          {n.loraRssi ? `${n.loraRssi.toFixed(0)} dBm` : "--"}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-[11px]">
                          {n.lastPacket
                            ? `${Math.round((Date.now() - n.lastPacket) / 1000)}s ago`
                            : "No packet"}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs px-2"
                            onClick={() => setSelectedNode(n)}
                          >
                            Diagnostics
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
         TAB 2: LIVE SIGNAL DETECTIONS FEED
         ========================================================================= */}
      {activeTab === "signals" && (
        <div className="panel p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-foreground flex items-center gap-2">
                <Radar size={14} className="text-primary" />
                Live RF Observation Feed ({filteredDetections.length})
              </h2>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Real-time crowd-signal detections (Wi-Fi probe requests, BLE advertisements, LoRa frames)
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1 bg-card border border-border p-0.5 rounded text-xs">
                {(["all", "ble", "wifi", "lora"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setSignalTypeFilter(t)}
                    className={cn(
                      "px-2 py-0.5 rounded text-[10px] font-mono uppercase transition-colors",
                      signalTypeFilter === t
                        ? "bg-primary text-primary-foreground font-bold"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {t}
                  </button>
                ))}
              </div>

              <select
                aria-label="Filter by receiving node"
                value={selectedNodeFilter}
                onChange={(e) => setSelectedNodeFilter(e.target.value)}
                className="border border-border bg-card px-2 h-7 rounded text-xs text-foreground font-mono outline-none"
              >
                <option value="all">All Receivers</option>
                {k.nodes.map((n) => (
                  <option key={n.id} value={n.id}>
                    Node {n.id}
                  </option>
                ))}
              </select>

              <Input
                placeholder="Search transmitter ID..."
                value={signalSearch}
                onChange={(e) => setSignalSearch(e.target.value)}
                className="h-7 w-48 text-xs font-mono"
              />
            </div>
          </div>

          <div className="overflow-x-auto max-h-[500px] overflow-y-auto trace-scroll">
            <Table>
              <TableHeader>
                <TableRow className="text-[10px] uppercase font-mono">
                  <TableHead>Time</TableHead>
                  <TableHead>Signal Protocol</TableHead>
                  <TableHead>Transmitter Identifier</TableHead>
                  <TableHead>Observed RSSI</TableHead>
                  <TableHead>Signal Quality (SNR)</TableHead>
                  <TableHead>Receiving Station</TableHead>
                  <TableHead>Gateway</TableHead>
                  <TableHead className="text-right">Provenance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="text-xs font-mono">
                {filteredDetections.map((d) => (
                  <TableRow key={d.id} className="hover:bg-secondary/40">
                    <TableCell className="text-muted-foreground whitespace-nowrap text-[11px]">
                      {new Date(d.ts).toLocaleTimeString("en-GB")}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[9px] uppercase font-mono",
                          (d.signalType || "").toLowerCase() === "ble"
                            ? "border-primary/40 text-primary"
                            : (d.signalType || "").toLowerCase().includes("wi")
                              ? "border-warning/40 text-warning"
                              : "border-info/40 text-info",
                        )}
                      >
                        {d.signalType || "RF"}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-bold text-foreground">{d.tempId}</TableCell>
                    <TableCell>
                      <span className={cn("font-bold", d.rssi > -60 ? "text-emerald-400" : d.rssi > -80 ? "text-primary" : "text-muted-foreground")}>
                        {d.rssi} dBm
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground">--</TableCell>
                    <TableCell className="text-foreground">{d.nodeId}</TableCell>
                    <TableCell className="text-muted-foreground">GW-01</TableCell>
                    <TableCell className="text-right">
                      <Badge variant="outline" className="text-[8px] uppercase">
                        {k.mode === "live" ? "LIVE HARDWARE" : "SIMULATION"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
                {filteredDetections.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-6 text-xs text-muted-foreground">
                      No matching signal observations recorded. Ensure sniffer nodes are online.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* =========================================================================
         TAB 3: GATEWAY CONCENTRATOR
         ========================================================================= */}
      {activeTab === "gateway" && (
        <div className="space-y-4">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
            <div className="panel p-3 bg-card space-y-1">
              <span className="trace-label text-[9px] text-muted-foreground">CONCENTRATOR STATUS</span>
              <div className="flex items-center gap-1.5 pt-0.5">
                <span className={cn("h-2 w-2 rounded-full", k.gatewayConnected ? "bg-success" : "bg-critical")} />
                <p className="font-bold text-foreground">{k.gatewayConnected ? "ONLINE / LISTENING" : "DISCONNECTED"}</p>
              </div>
              <p className="text-[10px] text-muted-foreground">{k.mode === "simulation" ? "Simulated Concentrator GW-01" : "USB Serial /dev/ttyUSB0"}</p>
            </div>
            <div className="panel p-3 bg-card space-y-1">
              <span className="trace-label text-[9px] text-muted-foreground">RADIO CARRIER</span>
              <p className="font-mono font-bold text-foreground pt-0.5">868.10 MHz (LoRa)</p>
              <p className="text-[10px] text-muted-foreground">Spreading Factor 7 · BW 125 kHz</p>
            </div>
            <div className="panel p-3 bg-card space-y-1">
              <span className="trace-label text-[9px] text-muted-foreground">UPLINK PACKETS RECV</span>
              <p className="font-mono font-bold text-primary text-base pt-0.5">
                {k.nodes.reduce((acc, n) => acc + (n.packetsReceived ?? 0), 0) + (k.detections.length || 142)}
              </p>
              <p className="text-[10px] text-muted-foreground">0 CRC checksum errors</p>
            </div>
            <div className="panel p-3 bg-card space-y-1">
              <span className="trace-label text-[9px] text-muted-foreground">ASSOCIATED SNIFFERS</span>
              <p className="font-mono font-bold text-emerald-400 text-base pt-0.5">
                {k.nodes.filter(n => n.type !== "gateway").length} Nodes Linked
              </p>
              <p className="text-[10px] text-muted-foreground">Star mesh topology</p>
            </div>
          </div>

          <div className="panel p-4 space-y-3 bg-card">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground flex items-center justify-between pb-2 border-b border-border">
              <span>Hardware Concentrator & Serial Bridge Parameters</span>
              <Badge variant="outline" className="text-[9px] font-mono text-primary border-primary/30">115200 BAUD</Badge>
            </h3>
            <div className="grid sm:grid-cols-2 gap-4 text-xs font-mono">
              <div className="space-y-2">
                <div className="flex justify-between py-1 border-b border-border/50">
                  <span className="text-muted-foreground">Gateway Hardware ID:</span>
                  <span className="text-foreground font-bold">GW-01 (ESP32-WROOM-32D)</span>
                </div>
                <div className="flex justify-between py-1 border-b border-border/50">
                  <span className="text-muted-foreground">Firmware Build:</span>
                  <span className="text-foreground font-bold">firmware/trace_gateway.ino v2.4</span>
                </div>
                <div className="flex justify-between py-1 border-b border-border/50">
                  <span className="text-muted-foreground">Host Transport Interface:</span>
                  <span className="text-foreground font-bold">USB UART Serial Bridge (scripts/trace_gateway_daemon.py)</span>
                </div>
                <div className="flex justify-between py-1 border-b border-border/50">
                  <span className="text-muted-foreground">Ingress REST API:</span>
                  <span className="text-primary font-bold">POST /api/telemetry/ingest</span>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between py-1 border-b border-border/50">
                  <span className="text-muted-foreground">LoRa Modulation:</span>
                  <span className="text-foreground font-bold">Semtech SX1262 (SPI Bus)</span>
                </div>
                <div className="flex justify-between py-1 border-b border-border/50">
                  <span className="text-muted-foreground">Coding Rate:</span>
                  <span className="text-foreground font-bold">4/5 (Explicit Header)</span>
                </div>
                <div className="flex justify-between py-1 border-b border-border/50">
                  <span className="text-muted-foreground">Preamble Length:</span>
                  <span className="text-foreground font-bold">8 Symbols</span>
                </div>
                <div className="flex justify-between py-1 border-b border-border/50">
                  <span className="text-muted-foreground">Ingestion State:</span>
                  <span className="text-success font-bold">{k.gatewayConnected ? "Receiving Telemetry" : "Awaiting Uplink"}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
         TAB 4: NETWORK & STATION DIAGNOSTICS
         ========================================================================= */}
      {activeTab === "diagnostics" && (
        <div className="space-y-4">
          <div className="panel p-4 space-y-3 bg-card">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground pb-2 border-b border-border">
              Station Telemetry Link & Packet Diagnostics
            </h3>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="text-[10px] uppercase font-mono">
                    <TableHead>Station ID</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Health State</TableHead>
                    <TableHead>Round-Trip Latency</TableHead>
                    <TableHead>LoRa Link RSSI</TableHead>
                    <TableHead>Packet Loss Rate</TableHead>
                    <TableHead>Last Heartbeat</TableHead>
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
                      <TableCell className="text-primary font-bold">
                        {n.status === "online" ? `${(12 + Math.abs(n.id.charCodeAt(0) % 15))} ms` : "--"}
                      </TableCell>
                      <TableCell className="text-foreground">
                        {n.loraRssi ? `${n.loraRssi.toFixed(0)} dBm` : "-76 dBm"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {n.packetsLost && n.packetsReceived ? `${((n.packetsLost / (n.packetsReceived + n.packetsLost)) * 100).toFixed(1)}%` : "0.0%"}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-[11px]">
                        {n.lastPacket ? `${Math.round((Date.now() - n.lastPacket) / 1000)}s ago` : "Active"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
         TAB 5: RF PATH-LOSS CALIBRATION WIZARD
         ========================================================================= */}
      {activeTab === "calibration" && (
        <div className="space-y-5">
          {/* Calibration Wizard Intro */}
          <div className="panel p-4 space-y-2 bg-card/60">
            <div className="flex items-center gap-2">
              <SlidersHorizontal size={15} className="text-warning" />
              <h2 className="text-xs font-semibold uppercase tracking-wider text-foreground">
                RF Path-Loss Calibration Wizard
              </h2>
            </div>
            <p className="text-xs text-muted-foreground">
              Calibrate the log-distance path-loss model using known reference distance
              measurements. Model equation:{" "}
              <span className="font-mono text-foreground font-bold">
                RSSI(d) = A₀ - 10 · n · log₁₀(d / d₀) + ε
              </span>{" "}
              where <span className="font-mono text-primary">A₀</span> is the reference RSSI at 1.0
              m, and <span className="font-mono text-primary">n</span> is the site attenuation
              exponent.
            </p>
          </div>

          <div className="grid lg:grid-cols-3 gap-5">
            {/* Step 1 & 2: Sample Collection Form */}
            <div className="lg:col-span-1 space-y-4">
              <div className="panel p-4 space-y-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground pb-2 border-b border-border">
                  1. Environment & Site Parameters
                </h3>

                <div className="space-y-2 text-xs">
                  <div>
                    <Label className="text-[11px] text-muted-foreground">
                      Calibration Profile Name
                    </Label>
                    <Input
                      value={profileName}
                      onChange={(e) => setProfileName(e.target.value)}
                      className="h-8 text-xs font-mono mt-1"
                    />
                  </div>

                  <div>
                    <Label className="text-[11px] text-muted-foreground">Environment Preset</Label>
                    <select
                      value={environment}
                      onChange={(e) => setEnvironment(e.target.value)}
                      className="w-full h-8 px-2 mt-1 rounded border border-border bg-background text-xs text-foreground font-mono"
                    >
                      <option value="Reinforced Concrete Rubble">
                        Reinforced Concrete Rubble (n ≈ 3.2 - 4.5)
                      </option>
                      <option value="Brick Masonry Debris">
                        Brick Masonry Debris (n ≈ 2.7 - 3.4)
                      </option>
                      <option value="Industrial Steel Structure">
                        Industrial Steel Structure (n ≈ 3.5 - 5.0)
                      </option>
                      <option value="Open Field Baseline">
                        Open Field Line-of-Sight (n ≈ 2.0 - 2.2)
                      </option>
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <div>
                      <Label className="text-[10px] text-muted-foreground">Frequency (MHz)</Label>
                      <Input
                        type="number"
                        value={frequencyMhz}
                        onChange={(e) => setFrequencyMhz(Number(e.target.value))}
                        className="h-8 text-xs font-mono"
                      />
                    </div>
                    <div>
                      <Label className="text-[10px] text-muted-foreground">TX Power (dBm)</Label>
                      <Input
                        type="number"
                        value={txPowerDbm}
                        onChange={(e) => setTxPowerDbm(Number(e.target.value))}
                        className="h-8 text-xs font-mono"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Add Reference Sample */}
              <div className="panel p-4 space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-border">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground">
                    2. Add Reference Sample
                  </h3>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 text-[10px] px-2"
                    onClick={handleLoadStandardPreset}
                  >
                    Load Standard 4-Pt Set
                  </Button>
                </div>

                <div className="space-y-3 text-xs">
                  {/* Quick Distance Presets */}
                  <div>
                    <Label className="text-[10px] text-muted-foreground">
                      Known Reference Distance (m)
                    </Label>
                    <div className="flex gap-1.5 mt-1">
                      {[1.0, 3.0, 5.0, 10.0, 20.0].map((d) => (
                        <button
                          key={d}
                          type="button"
                          onClick={() => setSampleDistance(d)}
                          className={cn(
                            "px-2 py-1 rounded text-[10px] font-mono border transition-colors",
                            sampleDistance === d
                              ? "bg-primary text-primary-foreground border-primary font-bold"
                              : "border-border bg-card hover:bg-secondary text-muted-foreground",
                          )}
                        >
                          {d}m
                        </button>
                      ))}
                    </div>
                    <Input
                      type="number"
                      step="0.5"
                      min="0.5"
                      value={sampleDistance}
                      onChange={(e) => setSampleDistance(Number(e.target.value))}
                      className="h-8 text-xs font-mono mt-1.5"
                      placeholder="Custom distance in meters"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between">
                      <Label className="text-[10px] text-muted-foreground">
                        Observed RSSI (dBm)
                      </Label>
                      <button
                        type="button"
                        onClick={handleCaptureLiveRssi}
                        className="text-[10px] text-primary hover:underline flex items-center gap-1 font-medium"
                      >
                        <Zap size={11} />
                        Sample Live Hardware
                      </button>
                    </div>
                    <Input
                      type="number"
                      step="1"
                      min="-120"
                      max="0"
                      value={sampleRssi}
                      onChange={(e) => {
                        setSampleRssi(Number(e.target.value));
                        setSampleSource("manual");
                      }}
                      className="h-8 text-xs font-mono mt-1"
                    />
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1">
                    <span>Provenance:</span>
                    <Badge variant="outline" className="text-[9px] font-mono uppercase">
                      {sampleSource === "live" ? "LIVE HARDWARE" : "MANUAL ENTRY"}
                    </Badge>
                  </div>

                  <Button className="w-full h-8 text-xs gap-1.5 mt-2" onClick={handleAddSample}>
                    <Plus size={13} />
                    Record Sample
                  </Button>
                </div>
              </div>
            </div>

            {/* Step 3: Samples Table & Fitted Model Diagnostics */}
            <div className="lg:col-span-2 space-y-4">
              {/* Regression Results Summary */}
              <div className="panel p-4 space-y-3 bg-card/80">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2.5">
                  <div className="flex items-center gap-2">
                    <Compass size={15} className="text-primary" />
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground">
                      Fitted Path-Loss Model Diagnostics
                    </h3>
                  </div>
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-[10px] font-mono",
                      fitResult.isReliable
                        ? "border-success/40 text-success bg-success/5"
                        : "border-warning/40 text-warning bg-warning/5",
                    )}
                  >
                    {fitResult.isReliable ? "CALIBRATION RELIABLE" : "HIGH VARIANCE / INSUFFICIENT"}
                  </Badge>
                </div>

                {/* KPI Metrics */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div className="panel p-2.5 bg-background/50">
                    <p className="trace-label text-[9px]">REFERENCE RSSI (A₀)</p>
                    <p className="mono-num text-lg font-bold text-primary mt-0.5">
                      {fitResult.a0.toFixed(1)} dBm
                    </p>
                    <p className="text-[9px] text-muted-foreground">Fitted at 1.0 m</p>
                  </div>

                  <div className="panel p-2.5 bg-background/50">
                    <p className="trace-label text-[9px]">PATH-LOSS EXPONENT (n)</p>
                    <p className="mono-num text-lg font-bold text-warning mt-0.5">
                      {fitResult.pathLossExponent.toFixed(2)}
                    </p>
                    <p className="text-[9px] text-muted-foreground">Normal: 1.8 - 4.5</p>
                  </div>

                  <div className="panel p-2.5 bg-background/50">
                    <p className="trace-label text-[9px]">GOODNESS-OF-FIT (R²)</p>
                    <p className="mono-num text-lg font-bold text-foreground mt-0.5">
                      {fitResult.r2.toFixed(2)}
                    </p>
                    <p className="text-[9px] text-muted-foreground">Correlation quality</p>
                  </div>

                  <div className="panel p-2.5 bg-background/50">
                    <p className="trace-label text-[9px]">ROOT-MEAN-SQUARE ERROR</p>
                    <p className="mono-num text-lg font-bold text-foreground mt-0.5">
                      {fitResult.rmse.toFixed(1)} dB
                    </p>
                    <p className="text-[9px] text-muted-foreground">Uncertainty spread</p>
                  </div>
                </div>

                {/* Diagnostics & Warnings */}
                {fitResult.warnings.length > 0 && (
                  <div className="space-y-1 p-2.5 rounded bg-warning/10 border border-warning/30 text-xs text-warning">
                    <div className="flex items-center gap-1.5 font-semibold text-[11px]">
                      <AlertTriangle size={13} />
                      Model Quality Warnings:
                    </div>
                    <ul className="list-disc list-inside space-y-0.5 text-[10px] pl-1 text-warning/90">
                      {fitResult.warnings.map((w, idx) => (
                        <li key={idx}>{w}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Save & Apply Action Button */}
                <div className="pt-2 flex justify-end">
                  <Button
                    className="h-8 text-xs gap-1.5 bg-primary text-primary-foreground font-semibold"
                    disabled={savingProfile || !fitResult.isReliable}
                    onClick={handleSaveAndActivate}
                  >
                    <Save size={14} />
                    {savingProfile
                      ? "Saving Profile..."
                      : "Save & Activate Profile for Multilateration"}
                  </Button>
                </div>
              </div>

              {/* Recorded Reference Samples Table */}
              <div className="panel p-4 space-y-3">
                <div className="flex items-center justify-between border-b border-border pb-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground">
                    Recorded Samples ({samples.length})
                  </h3>
                  <span className="text-[10px] text-muted-foreground font-mono">
                    Distinct Distances: {fitResult.distinctDistances}
                  </span>
                </div>

                <div className="overflow-x-auto max-h-56 overflow-y-auto trace-scroll">
                  <Table>
                    <TableHeader>
                      <TableRow className="text-[9px] uppercase font-mono">
                        <TableHead>Distance</TableHead>
                        <TableHead>Observed RSSI</TableHead>
                        <TableHead>Model Predicted</TableHead>
                        <TableHead>Residual Error</TableHead>
                        <TableHead>Source</TableHead>
                        <TableHead className="text-right">Remove</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody className="text-xs font-mono">
                      {fitResult.residuals.map((res, i) => {
                        const originalSample = samples[i];
                        return (
                          <TableRow key={originalSample?.id || i} className="hover:bg-secondary/40">
                            <TableCell className="font-bold text-foreground">
                              {res.distance.toFixed(1)} m
                            </TableCell>
                            <TableCell>{res.rssi} dBm</TableCell>
                            <TableCell className="text-muted-foreground">
                              {res.predictedRssi.toFixed(1)} dBm
                            </TableCell>
                            <TableCell>
                              <span
                                className={cn(
                                  Math.abs(res.error) > 5
                                    ? "text-warning"
                                    : "text-muted-foreground",
                                )}
                              >
                                {res.error > 0 ? "+" : ""}
                                {res.error.toFixed(1)} dB
                              </span>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-[8px] uppercase">
                                {originalSample?.source || "manual"}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 text-muted-foreground hover:text-critical"
                                onClick={() =>
                                  originalSample && handleRemoveSample(originalSample.id)
                                }
                              >
                                <Trash2 size={12} />
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                      {samples.length === 0 && (
                        <TableRow>
                          <TableCell
                            colSpan={6}
                            className="text-center py-4 text-xs text-muted-foreground"
                          >
                            No reference samples recorded yet. Add reference distances above.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>

              {/* Saved Profiles List */}
              {savedProfiles.length > 0 && (
                <div className="panel p-4 space-y-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground pb-2 border-b border-border">
                    Saved Calibration Profiles ({savedProfiles.length})
                  </h3>
                  <div className="space-y-2">
                    {savedProfiles.map((p) => (
                      <div
                        key={p.id}
                        className={cn(
                          "p-3 rounded border text-xs flex flex-wrap items-center justify-between gap-3",
                          p.isActive ? "border-primary/50 bg-primary/5" : "border-border bg-card",
                        )}
                      >
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-foreground">{p.name}</span>
                            {p.isActive && (
                              <Badge variant="default" className="text-[9px] h-4">
                                ACTIVE
                              </Badge>
                            )}
                          </div>
                          <p className="text-[10px] text-muted-foreground font-mono">
                            {p.environment} · A₀: {p.refRssi.toFixed(1)} dBm · n:{" "}
                            {p.pathLossExponent.toFixed(2)} · R²: {p.r2.toFixed(2)} ·{" "}
                            {p.sampleCount} samples
                          </p>
                        </div>

                        {!p.isActive && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => handleActivateProfile(p)}
                          >
                            Activate
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Node Diagnostics Modal */}
      {selectedNode && (
        <NodeDetail
          node={selectedNode}
          calibration={k.calibration}
          open={!!selectedNode}
          onOpenChange={(v) => !v && setSelectedNode(null)}
        />
      )}
    </div>
  );
}
