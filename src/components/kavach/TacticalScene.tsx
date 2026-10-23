import { Component, lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { Box, Crosshair, Map, X, ArrowRight, Play, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useKavach } from "@/lib/kavach/store";
import { MapCanvas, localXY, type Props } from "./MapCanvas";
import type { SceneSelection } from "./DisasterScene";
const Scene = lazy(() => import("./DisasterScene"));
class SceneBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { failed: boolean }
> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
export function TacticalScene(props: Props) {
  const k = useKavach();
  const [mounted, setMounted] = useState(false),
    [selection, setSelection] = useState<SceneSelection>(null),
    [reset, setReset] = useState(0);
  useEffect(() => setMounted(true), []);
  const node = selection?.kind === "node" ? k.nodes.find((n) => n.id === selection.id) : undefined;
  const zone = selection?.kind === "zone" ? k.zones.find((z) => z.id === selection.id) : undefined;
  const signal = selection?.kind === "signal" ? k.signal : null;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2 items-center justify-between px-1">
        <div className="inline-flex p-0.5 rounded-lg bg-slate-900/90 border border-slate-700/70 shadow-xs" role="group" aria-label="Tactical view mode">
          <button
            type="button"
            className={cn(
              "h-7 px-3 text-xs font-semibold rounded-md flex items-center gap-1.5 transition-all cursor-pointer",
              k.sceneMode === "2d"
                ? "bg-sky-500 text-slate-950 shadow-sm"
                : "text-slate-300 hover:text-white hover:bg-slate-800/60",
            )}
            onClick={() => k.setSceneMode("2d")}
          >
            <Map size={13} />
            2D Tactical
          </button>
          <button
            type="button"
            className={cn(
              "h-7 px-3 text-xs font-semibold rounded-md flex items-center gap-1.5 transition-all cursor-pointer",
              k.sceneMode === "3d"
                ? "bg-sky-500 text-slate-950 shadow-sm"
                : "text-slate-300 hover:text-white hover:bg-slate-800/60",
            )}
            onClick={() => k.setSceneMode("3d")}
          >
            <Box size={13} />
            3D Structure
          </button>
          <button
            type="button"
            title="Reset 3D camera"
            aria-label="Reset 3D camera"
            className="h-7 w-7 rounded-md flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800/60 transition-colors cursor-pointer"
            onClick={() => setReset((v) => v + 1)}
          >
            <Crosshair size={13} />
          </button>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono px-2 py-0.5 rounded-md border border-warning/30 bg-warning/10 text-warning font-medium">
            {k.mode === "simulation"
              ? `SCENARIO: ${k.scenario.toUpperCase()}`
              : "HARDWARE LOCAL DATUM"}
          </span>
        </div>
      </div>
      {k.sceneMode === "2d" ? (
        <MapCanvas {...props} />
      ) : (
        <div className={`relative overflow-hidden rounded-xl border border-slate-800/90 shadow-md ${props.className ?? "trace-map"}`}>
          {mounted && (
            <SceneBoundary
              fallback={
                <div className="h-full">
                  <p className="absolute z-10 top-14 left-4 text-xs text-warning">
                    3D unavailable on this device · 2D view retained
                  </p>
                  <MapCanvas {...props} className="h-full" />
                </div>
              }
            >
              <Suspense
                fallback={
                  <div className="h-full grid place-items-center text-primary trace-label">
                    Loading tactical scene…
                  </div>
                }
              >
                <Scene props={props} select={setSelection} reset={reset} />
              </Suspense>
            </SceneBoundary>
          )}
          <div className="absolute left-3 top-3 pointer-events-none rounded-lg bg-slate-950/85 backdrop-blur-md border border-slate-800/80 px-2.5 py-1.5 shadow-md">
            <p className="text-[9px] font-mono tracking-wider font-semibold text-sky-400 uppercase">
              TRACE · {k.incidents.find(i => i.id === k.incidentId)?.name ?? "SECTOR DELTA"}
            </p>
            <p className="text-[10px] font-mono text-slate-300 flex items-center gap-1.5 mt-0.5">
              <span className={cn("h-1.5 w-1.5 rounded-full", k.gatewayConnected ? "bg-emerald-400" : "bg-rose-400 animate-pulse")} />
              {k.mode === "simulation" ? "Simulated LoRa Bridge" : "Physical LoRa Bridge"} · {k.gatewayConnected ? "Connected" : "Disconnected"}
            </p>
          </div>
          {!k.zones.length && (
            <p className="absolute bottom-3 left-3 right-3 text-[11px] text-warning pointer-events-none rounded bg-slate-950/80 backdrop-blur-xs p-1.5 border border-warning/30">
              {k.estimationMessage}
            </p>
          )}
        </div>
      )}
      <Dialog
        open={!!selection}
        onOpenChange={(open) => {
          if (!open) setSelection(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogTitle>
            {node
              ? `${node.id} / ${node.type === "gateway" ? (k.mode === "simulation" ? "SIMULATED GATEWAY" : "Gateway") : "Sensor node"}`
              : zone
                ? `${zone.id} / Probable search zone`
                : signal
                  ? "Synthetic signal"
                  : "Estimate unavailable"}
          </DialogTitle>
          {node && (
            <>
              <dl className="grid grid-cols-2 gap-3 text-xs">
                <dt className="text-muted-foreground">Status</dt>
                <dd>{node.status.toUpperCase()}</dd>
                <dt className="text-muted-foreground">GPS Location</dt>
                <dd className="mono-num">
                  {node.lat && node.lon ? (
                    <span>
                      {node.lat.toFixed(5)}°N, {node.lon.toFixed(5)}°E (
                      {node.gpsFix ? `${node.gpsFix.toUpperCase()} Fix` : "NEO-6M Fix"})
                    </span>
                  ) : (
                    <span className="text-muted-foreground italic">GPS Unavailable</span>
                  )}
                </dd>
                <dt className="text-muted-foreground">Grid Position</dt>
                <dd className="mono-num">
                  {localXY(node).x.toFixed(1)} m E / {localXY(node).y.toFixed(1)} m N
                </dd>
                <dt className="text-muted-foreground">RSSI / Battery</dt>
                <dd className="mono-num">
                  {node.rssi.toFixed(0)} dBm / {node.battery.toFixed(0)}%
                </dd>
                <dt className="text-muted-foreground">Packets (RX / Lost)</dt>
                <dd className="mono-num">
                  {node.packetsReceived ?? 0} / {node.packetsLost ?? 0}
                </dd>
                <dt className="text-muted-foreground">Observation Age</dt>
                <dd className="mono-num text-[11px]">
                  {node.lastPacket
                    ? `${Math.max(0, Math.round((Date.now() - node.lastPacket) / 1000))}s ago`
                    : "Active feed"}
                </dd>
              </dl>
              <div className="p-2 rounded bg-secondary/50 border border-border text-[11px] text-muted-foreground">
                <p>
                  <strong>Role:</strong> Physical sniffer anchor station. Never interpret physical
                  sensor GPS coordinates as a survivor position.
                </p>
              </div>
              {k.mode === "simulation" && (
                <>
                  <label className="flex gap-2 items-center text-xs">
                    <input
                      type="checkbox"
                      checked={node.status !== "offline"}
                      onChange={(e) =>
                        node.type === "gateway"
                          ? k.setGateway(e.target.checked)
                          : k.updateNode(node.id, {
                              status: e.target.checked ? "online" : "offline",
                            })
                      }
                    />
                    Simulated {node.type === "gateway" ? "transport" : "node"} online
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    {(["x", "y"] as const).map((axis) => (
                      <label key={axis} className="text-xs text-muted-foreground">
                        {axis.toUpperCase()} (m)
                        <input
                          className="w-full mt-1 p-2 bg-secondary border border-border rounded"
                          type="number"
                          min={-240}
                          max={240}
                          value={Math.round(localXY(node)[axis])}
                          onChange={(e) => {
                            const v = Number(e.target.value);
                            if (!Number.isFinite(v)) return;
                            const p = localXY(node);
                            k.moveNode(node.id, axis === "x" ? v : p.x, axis === "y" ? v : p.y);
                          }}
                        />
                      </label>
                    ))}
                  </div>
                </>
              )}
            </>
          )}
          {zone && (
            <>
              <p className="text-sm text-warning font-semibold">
                ±{zone.radius} m · {zone.confidence}% Heuristic Confidence
              </p>
              <p className="text-xs">Supporting nodes: {zone.contributingNodes.join(" · ")}</p>
              <p className="text-xs text-muted-foreground">
                Residual fit error: {zone.residual?.toFixed(1)} m.
              </p>
              <div className="p-2 rounded bg-warning/10 border border-warning/30 text-[11px] text-warning space-y-1">
                <p className="font-semibold">Estimated Search-Priority Area</p>
                <p>
                  This zone is derived from log-distance RF path-loss multilateral estimation. It
                  represents a search bounding polygon, NOT an independently verified survivor
                  coordinate.
                </p>
              </div>
            </>
          )}
          {signal && (
            <>
              <p className="text-xs text-success">
                SIMULATION GROUND TRUTH · {signal.id} · {signal.kind}
              </p>
              <div className="grid grid-cols-2 gap-3">
                {(["x", "y", "strength"] as const).map((axis) => (
                  <label key={axis} className="text-xs text-muted-foreground">
                    {axis === "strength" ? "Power offset (dB)" : `${axis.toUpperCase()} (m)`}
                    <input
                      type="number"
                      className="mt-1 w-full bg-secondary rounded border border-border p-2"
                      value={Math.round(signal[axis])}
                      onChange={(e) => {
                        const value = Number(e.target.value);
                        if (Number.isFinite(value)) k.setSignal({ [axis]: value });
                      }}
                    />
                  </label>
                ))}
              </div>
              <Button variant="outline" onClick={k.generateFalsePositive}>
                Switch to noise source
              </Button>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
const steps = [
  {
    title: "Correlated supporting evidence",
    detail:
      "Three synthetic sniffers report the same anonymous source. The amber search zone is an estimate, not a person’s location.",
  },
  {
    title: "Node heartbeat lost",
    detail:
      "One sniffer is offline. Two observations cannot establish a new zone; the previous estimate is withdrawn.",
  },
  {
    title: "Transport interrupted",
    detail: "The simulated gateway is offline. Field observations are unavailable to command.",
  },
  {
    title: "Obstructed industrial sector",
    detail:
      "Metal obstruction and radio noise increase range uncertainty. Compare the search radius and residual.",
  },
  {
    title: "Noise-only source",
    detail:
      "Inconsistent radio evidence lowers search priority. A detected signal does not establish a possible survivor.",
  },
  {
    title: "Recovery",
    detail:
      "The simulated gateway and sniffers are restored. Correlated observations produce a fresh probable search zone.",
  },
];
export function DemoWalkthrough() {
  const k = useKavach();
  const [step, setStep] = useState<number | null>(null);
  const apply = (index: number) => {
    k.pause();
    k.setSceneMode("3d");
    if (index === 0 || index === 5) {
      k.guidedDemo();
      k.pause();
    }
    if (index === 1) k.updateNode("N01", { status: "offline" });
    if (index === 2) {
      k.updateNode("N01", { status: "online" });
      k.setGateway(false);
    }
    if (index === 3) {
      k.setGateway(true);
      k.setScenario("industrial");
    }
    if (index === 4) {
      k.generateFalsePositive();
      k.pause();
    }
    setStep(index);
  };
  const current = step === null ? null : steps[step];
  return (
    <>
      <Button onClick={() => apply(0)} disabled={k.mode === "live"}>
        <Play />
        Demo walkthrough
      </Button>
      {current && (
        <section
          className="border-y border-primary/40 bg-primary/5 p-4 space-y-3"
          aria-label="Demo walkthrough"
        >
          <div className="flex justify-between gap-3">
            <div>
              <p className="trace-label text-primary">
                WALKTHROUGH {Number(step) + 1} / {steps.length} · SIMULATION PAUSED
              </p>
              <h2 className="text-sm font-semibold mt-2">{current.title}</h2>
            </div>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Close walkthrough"
              onClick={() => setStep(null)}
            >
              <X />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">{current.detail}</p>
          <p className="mono-num text-xs text-warning">
            {k.zones[0]
              ? `${k.zones[0].confidence}% heuristic · ±${k.zones[0].radius} m · ${k.zones[0].priority} priority`
              : "No current estimate"}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={step === 0}
              onClick={() => {
                if (step !== null) {
                  k.guidedDemo();
                  k.pause();
                  for (let i = 1; i < step; i++) apply(i);
                  setStep(step - 1);
                }
              }}
            >
              Previous
            </Button>
            <Button
              size="sm"
              onClick={() => {
                if (step === steps.length - 1) {
                  setStep(null);
                  k.start();
                } else apply(Number(step) + 1);
              }}
            >
              {step === steps.length - 1 ? (
                <>
                  <Check />
                  Finish & resume
                </>
              ) : (
                <>
                  Next
                  <ArrowRight />
                </>
              )}
            </Button>
          </div>
        </section>
      )}
    </>
  );
}
