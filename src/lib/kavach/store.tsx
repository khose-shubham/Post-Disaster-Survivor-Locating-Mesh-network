import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { makeRng, ESTIMATOR_VERSION } from "./engine";
import type {
  AlertItem,
  AppEvent,
  CalibrationSettings,
  ConfirmedSurvivorRecord,
  Detection,
  EnhancedTelemetryPacket,
  EstimationPipelineReport,
  LogEvent,
  RescueOperation,
  RescueOperationStatus,
  SearchZone,
  SensorNode,
  SimulationRunSnapshot,
  TelemetryPacket,
} from "./types";
import {
  SITE_ORIGIN,
  DEFAULT_CALIBRATION,
  SCENARIO_PRESETS,
  canTransitionStatus,
  getRescueIntervals,
  seedRescueOperations,
  seedConfirmedSurvivors,
  seedInitialEvents,
  initialState,
  advanceSimulation,
  switchScenario,
  switchMode,
  ingestHardwarePacket,
  validateEnhancedTelemetry,
  uid,
  type State,
  type Incident,
  type SimSignal,
  type Sample,
  type SceneScenario,
  type EstimationState,
} from "./state";
import {
  clearPersistedOperationalData,
  loadPersistedOperationalData,
  savePersistedOperationalData,
} from "./persistence";

export {
  SITE_ORIGIN,
  DEFAULT_CALIBRATION,
  SCENARIO_PRESETS,
  canTransitionStatus,
  getRescueIntervals,
  validateEnhancedTelemetry,
  clearPersistedOperationalData,
  initialState,
  seedRescueOperations,
  seedConfirmedSurvivors,
  seedInitialEvents,
};

export type { State, Incident, SimSignal, Sample, SceneScenario, EstimationState };

export interface UserProfile {
  id: string;
  username: string;
  email: string;
  role: "Administrator" | "Incident Commander" | "Responder" | "Analyst" | "Viewer";
  full_name: string;
}

export interface Api extends State {
  setSceneMode: (mode: "2d" | "3d") => void;
  setScenario: (scenario: SceneScenario) => void;
  start: () => void;
  pause: () => void;
  stop: () => void;
  reset: () => void;
  step: () => void;
  setMode: (m: "simulation" | "live") => void;
  setCalibration: (c: CalibrationSettings) => void;
  generateSurvivor: () => void;
  generateFalsePositive: () => void;
  simulateNodeFailure: () => void;
  toggleNodeOffline: (id: string) => void;
  acknowledge: (id: string) => void;
  ingestPacket: (p: TelemetryPacket) => void;
  ingestEnhancedPacket: (p: EnhancedTelemetryPacket) => {
    accepted: boolean;
    error?: string | undefined;
  };
  configure: (
    c: Partial<
      Pick<
        State,
        | "rate"
        | "noise"
        | "obstruction"
        | "packetLoss"
        | "expiry"
        | "apiUrl"
        | "apiStatus"
        | "apiTimestamp"
      >
    >,
  ) => void;
  updateNode: (id: string, c: Partial<SensorNode>) => void;
  addNode: () => void;
  deleteNode: (id: string) => void;
  moveNode: (id: string, x: number, y: number) => void;
  setSignal: (c: Partial<SimSignal>) => void;
  removeSignal: () => void;
  setGateway: (v: boolean) => void;
  selectIncident: (id: string) => void;
  createIncident: (c: Omit<Incident, "id" | "created" | "timeline">) => void;
  updateIncident: (id: string, c: Partial<Incident>) => void;
  createOperation: (op: Omit<RescueOperation, "id" | "lastUpdated" | "history">) => {
    success: boolean;
    error?: string | undefined;
    id?: string | undefined;
  };
  updateOperationStatus: (
    id: string,
    toStatus: RescueOperationStatus,
    note: string,
    operator?: string | undefined,
  ) => { success: boolean; error?: string | undefined };
  updateOperation: (id: string, c: Partial<RescueOperation>) => void;
  addConfirmedSurvivor: (s: Omit<ConfirmedSurvivorRecord, "id">) => { id: string };
  updateSurvivorStatus: (id: string, status: "awaiting_rescue" | "rescued") => void;
  clearPersistedData: () => void;
  guidedDemo: () => void;
  // V6 Operational Reliability & Intelligence Additions
  setSelectedNodeId: (id: string | null) => void;
  saveBaselineRun: () => void;
  clearBaselineRun: () => void;
  runEstimationPass: () => void;
  appendAppEvent: (event: Omit<AppEvent, "id" | "ts">) => void;
  // V8 Production Backend, Auth & Real-Time Additions
  currentUser: UserProfile | null;
  serverReady: boolean;
  sseConnected: boolean;
  loginUser: (
    username: string,
    password: string,
  ) => Promise<{ success: boolean; error?: string | undefined }>;
  logoutUser: () => Promise<void>;
  switchUserRole: (role: UserProfile["role"]) => Promise<void>;
}

const Ctx = createContext<Api | null>(null);

export function KavachProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>(initialState);
  const rng = useRef(makeRng(20261012));
  const liveCache = useRef<Partial<State> | null>(null);
  const simCache = useRef<State | null>(null);
  const seenSeqs = useRef<Set<string>>(new Set());

  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [serverReady, setServerReady] = useState<boolean>(true);
  const [sseConnected, setSseConnected] = useState<boolean>(false);

  // Authenticate user session
  const loginUser = async (username: string, password: string) => {
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (res.ok && data.user) {
        setCurrentUser(data.user);
        return { success: true };
      }
      return { success: false, error: data.error || "Login failed" };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  };

  const logoutUser = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // ignore
    }
    setCurrentUser(null);
  };

  const switchUserRole = async (role: UserProfile["role"]) => {
    const rolePasswords: Record<UserProfile["role"], { u: string; p: string }> = {
      Administrator: { u: "admin", p: "Admin123456!" },
      "Incident Commander": { u: "commander", p: "Commander123!" },
      Responder: { u: "responder", p: "Responder123!" },
      Analyst: { u: "analyst", p: "Analyst123!" },
      Viewer: { u: "viewer", p: "Viewer123!" },
    };
    const creds = rolePasswords[role];
    if (creds) {
      await loginUser(creds.u, creds.p);
    }
  };

  // Hydrate local operational records if available
  useEffect(() => {
    const bundle = loadPersistedOperationalData();
    if (bundle) {
      setState((prev) => ({
        ...prev,
        incidents: bundle.incidents?.length ? bundle.incidents : prev.incidents,
        operations: bundle.operations?.length ? bundle.operations : prev.operations,
        survivors: bundle.survivors?.length ? bundle.survivors : prev.survivors,
        events: bundle.events?.length ? bundle.events : prev.events,
      }));
    }

    if (typeof window === "undefined") return;

    // Fetch active session or login default commander
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data && data.user) {
          setCurrentUser(data.user);
        } else {
          loginUser("commander", "Commander123!");
        }
      })
      .catch(() => {});

    // Check backend readiness
    fetch("/api/ready")
      .then((r) => setServerReady(r.ok))
      .catch(() => setServerReady(false));

    // Connect real-time Server-Sent Events stream
    let es: EventSource | null = null;
    try {
      es = new EventSource("/api/events/stream");
      es.addEventListener("open", () => setSseConnected(true));
      es.addEventListener("error", () => setSseConnected(false));

      es.addEventListener("telemetry:accepted", (event) => {
        try {
          const parsed = JSON.parse((event as MessageEvent).data);
          const tlm = parsed.data;
          if (tlm && tlm.node_id) {
            const pkt: TelemetryPacket = {
              nodeId: tlm.node_id,
              latitude: typeof tlm.lat === "number" ? tlm.lat : 19.8762,
              longitude: typeof tlm.lon === "number" ? tlm.lon : 74.4785,
              sound: typeof tlm.sound_db === "number" ? tlm.sound_db : 42,
              vibration: typeof tlm.vibration_g === "number" ? tlm.vibration_g : 0.04,
              temperature: typeof tlm.thermal_c === "number" ? tlm.thermal_c : 28,
              bleDetected: 1,
              wifiDetected: 0,
              rssi: typeof tlm.rssi === "number" ? tlm.rssi : -70,
              battery: typeof tlm.battery === "number" ? tlm.battery : 90,
              timestamp: tlm.timestamp || Date.now(),
              loraRssi: -75,
              loraSnr: 8.5,
              seq: tlm.seq,
              gatewayId: tlm.gateway_id || undefined,
            };

            setState((prev) => {
              let found = false;
              const nodes = prev.nodes.map((n) => {
                if (n.id === pkt.nodeId) {
                  found = true;
                  return {
                    ...n,
                    rssi: pkt.rssi,
                    battery: pkt.battery,
                    sound: pkt.sound,
                    vibration: pkt.vibration,
                    temperature: pkt.temperature,
                    status: "online" as const,
                    lat: pkt.latitude || n.lat,
                    lon: pkt.longitude || n.lon,
                    lastPacket: pkt.timestamp,
                  };
                }
                return n;
              });

              if (!found) {
                nodes.push({
                  id: pkt.nodeId,
                  label: `Station ${pkt.nodeId}`,
                  lat: pkt.latitude,
                  lon: pkt.longitude,
                  status: "online",
                  battery: pkt.battery,
                  sound: pkt.sound,
                  vibration: pkt.vibration,
                  temperature: pkt.temperature,
                  bleDetected: 1,
                  wifiDetected: 0,
                  rssi: pkt.rssi,
                  loraRssi: pkt.loraRssi,
                  loraSnr: pkt.loraSnr,
                  lastPacket: pkt.timestamp,
                  sensorHealth: { rf: "ok", battery: "ok", acoustic: "ok" },
                  hops: 1,
                  type: pkt.nodeId.toLowerCase().includes("gw") ? "gateway" : "sniffer",
                });
              }

              // In live hardware mode, run live multilateration engine
              const next =
                prev.mode === "live"
                  ? ingestHardwarePacket({ ...prev, nodes }, pkt)
                  : { ...prev, nodes };

              return {
                ...next,
                gatewayConnected: true,
                lastTelemetryAt: Date.now(),
              };
            });
          }
        } catch {
          // ignore
        }
      });

      es.addEventListener("gateway:status_changed", (event) => {
        try {
          const parsed = JSON.parse((event as MessageEvent).data);
          if (parsed?.data?.status === "online") {
            setState((prev) => ({ ...prev, gatewayConnected: true }));
          }
        } catch {
          // ignore
        }
      });

      es.addEventListener("incident:updated", (event) => {
        try {
          const parsed = JSON.parse((event as MessageEvent).data);
          if (parsed && parsed.data) {
            setState((prev) => ({
              ...prev,
              incidents: prev.incidents.map((inc) =>
                inc.id === parsed.data.id ? { ...inc, name: parsed.data.name } : inc,
              ),
            }));
          }
        } catch {
          // ignore
        }
      });
    } catch {
      setSseConnected(false);
    }

    return () => {
      if (es) es.close();
    };
  }, []);

  // Save changes to local persistence
  useEffect(() => {
    savePersistedOperationalData({
      incidents: state.incidents,
      operations: state.operations,
      survivors: state.survivors,
      events: state.events,
    });
  }, [state.incidents, state.operations, state.survivors, state.events]);

  const log = (
    s: State,
    level: LogEvent["level"],
    source: string,
    message: string,
    incidentId?: string,
  ) => {
    s.logs = [
      {
        id: uid("evt"),
        ts: Date.now(),
        level,
        source,
        message,
        incidentId: incidentId ?? s.incidentId,
      },
      ...s.logs,
    ].slice(0, 400);
  };

  const alert = (s: State, title: string, reason: string, target: string, incidentId?: string) => {
    if (s.alerts.some((a) => a.target === target && !a.acknowledged)) return;
    const item: AlertItem = {
      id: uid("alert"),
      ts: Date.now(),
      kind: target.startsWith("N") ? "node" : "zone",
      severity: "warning",
      title,
      reason,
      target,
      acknowledged: false,
      incidentId: incidentId ?? s.incidentId,
    };
    s.alerts = [item, ...s.alerts].slice(0, 100);
  };

  const appendEvent = (s: State, ev: Omit<AppEvent, "id" | "ts">) => {
    const item: AppEvent = {
      id: uid("evt-app"),
      ts: Date.now(),
      incidentId: s.incidentId,
      ...ev,
    };
    s.events = [item, ...s.events].slice(0, 300);
  };

  const advance = (prev: State, recalculate = false): State => {
    if (prev.mode !== "simulation") return prev;
    return advanceSimulation(
      prev,
      () => (recalculate ? makeRng(20261012)() : rng.current()),
      recalculate,
    );
  };

  const advanceRef = useRef(advance);
  advanceRef.current = advance;

  useEffect(() => {
    setState((p) => advanceRef.current(p, true));
  }, []);

  useEffect(() => {
    if (!state.running || state.mode !== "simulation") return;
    const timer = setInterval(() => setState((p) => advanceRef.current(p)), state.rate);
    return () => clearInterval(timer);
  }, [state.running, state.mode, state.rate]);

  const mutate = (f: (s: State) => void) =>
    setState((p) => {
      const s: State = {
        ...p,
        nodes: p.nodes.map((n) => ({ ...n })),
        logs: [...p.logs],
        alerts: [...p.alerts],
        events: [...p.events],
      };
      f(s);
      const changed =
        s.mode === "simulation" &&
        (s.signal !== p.signal ||
          s.calibration !== p.calibration ||
          s.noise !== p.noise ||
          s.obstruction !== p.obstruction ||
          s.expiry !== p.expiry ||
          s.gatewayConnected !== p.gatewayConnected ||
          JSON.stringify(s.nodes) !== JSON.stringify(p.nodes));
      return changed ? advanceRef.current(s, true) : s;
    });

  const setSignal = (c: Partial<SimSignal>) =>
    mutate((s) => {
      if (s.mode !== "simulation") return;
      s.signal = {
        id: "SYN-01",
        x: 20,
        y: 15,
        strength: 0,
        path: "stationary",
        kind: "survivor",
        ...s.signal,
        ...c,
      };
      log(s, "info", "SIM", "Synthetic signal configuration updated");
    });

  const api: Api = {
    ...state,
    setSceneMode: (sceneMode) =>
      mutate((s) => {
        s.sceneMode = sceneMode;
      }),
    setScenario: (scenario) => {
      if (state.mode !== "simulation") return;
      setState((prev) => switchScenario(prev, scenario, () => rng.current()));
    },
    start: () =>
      mutate((s) => {
        if (s.mode === "simulation") {
          s.running = true;
          log(s, "info", "SIM", "Simulation started");
          appendEvent(s, {
            type: "simulation_started",
            severity: "info",
            source: "SIMULATION",
            message: `Simulation started in ${s.scenario.toUpperCase()} scenario`,
          });
        }
      }),
    pause: () =>
      mutate((s) => {
        s.running = false;
        log(s, "info", "SIM", "Simulation paused");
        appendEvent(s, {
          type: "simulation_paused",
          severity: "info",
          source: "SIMULATION",
          message: "Simulation timer paused",
        });
      }),
    stop: () =>
      mutate((s) => {
        s.running = false;
        s.signal = null;
        s.zones = [];
        s.estimationReport = null;
        s.estimationState = "no_observations";
        s.estimationMessage = "Simulation stopped · Signal generator idle";
        log(s, "warn", "SIM", "Simulation stopped · source removed");
        appendEvent(s, {
          type: "simulation_stopped",
          severity: "warning",
          source: "SIMULATION",
          message: "Simulation stopped and synthetic signal removed",
        });
      }),
    reset: () => {
      if (state.mode !== "simulation") return;
      rng.current = makeRng(20261012);
      setState((p) =>
        advanceRef.current(
          {
            ...initialState(),
            running: false,
            calibration: p.calibration,
            incidents: p.incidents,
            incidentId: p.incidentId,
            apiUrl: p.apiUrl,
            events: [
              {
                id: uid("evt-app"),
                ts: Date.now(),
                type: "simulation_reset" as const,
                severity: "info" as const,
                source: "SIMULATION",
                message: "Simulation reset to deterministic initial seed (20261012)",
                incidentId: p.incidentId,
              },
              ...p.events,
            ].slice(0, 300),
          },
          true,
        ),
      );
    },
    step: () => setState((p) => advanceRef.current(p)),
    setMode: (targetMode) => {
      if (targetMode === state.mode) return;
      setState((prev) => {
        const { nextState, newSimCache, newLiveCache } = switchMode(
          prev,
          targetMode,
          simCache.current,
          liveCache.current,
          (s) => advanceRef.current(s, true),
        );
        simCache.current = newSimCache;
        liveCache.current = newLiveCache;
        return nextState;
      });
    },
    setCalibration: (c) =>
      mutate((s) => {
        if (!Object.values(c).every(Number.isFinite)) return;
        s.calibration = {
          refRssi: Math.min(-20, Math.max(-100, c.refRssi)),
          pathLossExponent: Math.min(6, Math.max(1, c.pathLossExponent)),
          minRadius: Math.min(100, Math.max(1, c.minRadius)),
          maxRadius: Math.min(500, Math.max(Math.max(1, c.minRadius), c.maxRadius)),
        };
        appendEvent(s, {
          type: "calibration_updated",
          severity: "info",
          source: "CALIBRATION",
          message: `RF calibration tuned: refRssi ${s.calibration.refRssi}dBm, n=${s.calibration.pathLossExponent}`,
        });
      }),
    configure: (c) =>
      mutate((s) => {
        Object.assign(s, c);
        s.rate = Math.min(10000, Math.max(500, s.rate));
        s.noise = Math.min(15, Math.max(0, s.noise));
        s.obstruction = Math.min(20, Math.max(0, s.obstruction));
        if (c.packetLoss !== undefined) s.packetLoss = Math.min(100, Math.max(0, c.packetLoss));
        s.expiry = Math.min(300, Math.max(5, s.expiry));
        appendEvent(s, {
          type: "settings_changed",
          severity: "info",
          source: "SIMULATION",
          message: `Simulation parameters configured: noise ${s.noise}dB, loss ${s.packetLoss}%, rate ${s.rate}ms`,
        });
      }),
    generateSurvivor: () => {
      setSignal({ kind: "survivor", x: 20, y: 15, path: "stationary" });
      mutate((s) => {
        if (s.mode === "simulation") s.running = true;
      });
    },
    generateFalsePositive: () => {
      setSignal({ kind: "noise" });
      mutate((s) => {
        if (s.mode === "simulation") s.running = true;
      });
    },
    guidedDemo: () => {
      if (state.mode !== "simulation") return;
      rng.current = makeRng(20261012);
      setState((p) =>
        advanceRef.current(
          {
            ...initialState(),
            incidents: p.incidents,
            incidentId: p.incidentId,
            apiUrl: p.apiUrl,
          },
          true,
        ),
      );
    },
    simulateNodeFailure: () => {
      const n = state.nodes.find((node) => node.status === "online" && node.type !== "gateway");
      if (n) api.updateNode(n.id, { status: "offline" });
    },
    toggleNodeOffline: (id) => {
      const node = state.nodes.find((n) => n.id === id);
      if (!node) return;
      if (node.type === "gateway") {
        api.setGateway(node.status === "offline");
      } else {
        api.updateNode(id, { status: node.status === "offline" ? "online" : "offline" });
      }
    },
    acknowledge: (id) =>
      mutate((s) => {
        s.alerts = s.alerts.map((a) => (a.id === id ? { ...a, acknowledged: true } : a));
      }),
    updateNode: (id, c) =>
      mutate((s) => {
        if (s.mode !== "simulation") return;
        const n = s.nodes.find((node) => node.id === id);
        if (!n) return;
        const before = n.status;
        Object.assign(n, c);
        if (n.type === "gateway") s.gatewayConnected = n.status !== "offline";
        if (before !== n.status) {
          const isOff = n.status === "offline";
          log(
            s,
            isOff ? "warn" : "info",
            n.id,
            `Node heartbeat ${isOff ? "lost" : "restored"} (simulated)`,
          );
          appendEvent(s, {
            type: "node_status_changed",
            severity: isOff ? "warning" : "info",
            source: "NODE_MANAGER",
            message: `Node ${n.id} status changed to ${n.status}`,
            nodeId: n.id,
          });
          if (isOff) alert(s, "Node heartbeat lost", "Synthetic node offline", n.id);
        }
      }),
    moveNode: (id, x, y) =>
      mutate((s) => {
        if (s.mode !== "simulation") return;
        const n = s.nodes.find((node) => node.id === id);
        if (!n) return;
        const latOffset = y / 111111;
        const lonOffset = x / (111111 * Math.cos((SITE_ORIGIN.lat * Math.PI) / 180));
        n.lat = SITE_ORIGIN.lat + latOffset;
        n.lon = SITE_ORIGIN.lon + lonOffset;
      }),
    addNode: () =>
      mutate((s) => {
        if (s.mode !== "simulation" || s.nodes.length >= 10) return;
        let i = 1;
        while (s.nodes.some((n) => n.id === `N${String(i).padStart(2, "0")}`)) i++;
        const newId = `N${String(i).padStart(2, "0")}`;
        s.nodes = [
          ...s.nodes,
          {
            id: newId,
            label: `Added simulated sniffer ${newId}`,
            lat: SITE_ORIGIN.lat + 0.0014,
            lon: SITE_ORIGIN.lon,
            type: "sniffer",
            status: "online",
            battery: 90,
            sound: 35,
            vibration: 0.04,
            temperature: 28.0,
            bleDetected: 0,
            wifiDetected: 0,
            rssi: -95,
            loraRssi: -78,
            loraSnr: 8.5,
            lastPacket: 0,
            sensorHealth: { gps: "ok", mic: "ok", vibration: "ok", thermal: "ok", lora: "ok" },
            hops: 1,
            firmware: "trace-demo 1.0",
            uptime: 0,
            packetsReceived: 0,
            packetsLost: 0,
          },
        ];
        log(s, "info", "SIM", `Simulated sniffer ${newId} added`);
        appendEvent(s, {
          type: "node_status_changed",
          severity: "info",
          source: "NODE_MANAGER",
          message: `Simulated sniffer ${newId} deployed to field topology`,
          nodeId: newId,
        });
      }),
    deleteNode: (id) =>
      mutate((s) => {
        if (
          s.mode !== "simulation" ||
          s.nodes.length <= 3 ||
          s.nodes.find((n) => n.id === id)?.type === "gateway"
        )
          return;
        s.nodes = s.nodes.filter((n) => n.id !== id);
        log(s, "warn", "SIM", `${id} removed from scenario`);
        appendEvent(s, {
          type: "node_status_changed",
          severity: "warning",
          source: "NODE_MANAGER",
          message: `Simulated sniffer ${id} decommissioned from scenario`,
          nodeId: id,
        });
      }),
    setSignal,
    removeSignal: () =>
      mutate((s) => {
        if (s.mode === "simulation") {
          s.signal = null;
          s.zones = [];
          s.estimationReport = null;
          s.estimationState = "no_observations";
          s.estimationMessage = "No active synthetic source · Signal generator idle";
          log(s, "info", "SIM", "Synthetic source removed");
        }
      }),
    setGateway: (v) =>
      mutate((s) => {
        if (s.mode !== "simulation") return;
        s.gatewayConnected = v;
        s.nodes = s.nodes.map((n) =>
          n.type === "gateway" ? { ...n, status: v ? "online" : "offline" } : n,
        );
        log(
          s,
          v ? "info" : "critical",
          "GATEWAY",
          `Gateway ${v ? "restored" : "disconnected"} (simulated)`,
        );
        appendEvent(s, {
          type: v ? "gateway_connected" : "gateway_disconnected",
          severity: v ? "info" : "critical",
          source: "GATEWAY",
          message: `Gateway ${v ? "restored" : "disconnected"} (simulated transport ${v ? "online" : "offline"})`,
        });
        if (!v) alert(s, "Gateway disconnected", "Observation transport unavailable", "GATEWAY");
      }),
    selectIncident: (id) =>
      mutate((s) => {
        s.incidentId = id;
      }),
    createIncident: (c) =>
      mutate((s) => {
        const id = uid("INC");
        s.incidents = [
          ...s.incidents,
          {
            ...c,
            id,
            created: Date.now(),
            timeline: ["Incident created"],
            lastUpdated: Date.now(),
          },
        ];
        s.incidentId = id;
        log(s, "info", id, "Incident created in local session");
        appendEvent(s, {
          type: "incident_created",
          severity: "info",
          source: "INCIDENT",
          message: `Incident ${id} (${c.name}) registered in local session`,
          incidentId: id,
        });
      }),
    updateIncident: (id, c) =>
      mutate((s) => {
        s.incidents = s.incidents.map((i) =>
          i.id === id
            ? {
                ...i,
                ...c,
                lastUpdated: Date.now(),
                timeline: [
                  ...i.timeline,
                  `${new Date().toLocaleTimeString("en-GB")} · ${c.status ? `Incident ${c.status}` : "Incident details updated"}`,
                ],
              }
            : i,
        );
        if (id === s.incidentId && c.status && c.status !== "active") s.running = false;
        log(s, "info", id, "Incident record updated");
        appendEvent(s, {
          type: "incident_updated",
          severity: "info",
          source: "INCIDENT",
          message: `Incident ${id} updated: ${c.status ? `status ${c.status}` : "record modified"}`,
          incidentId: id,
        });
      }),
    ingestPacket: (p) => {
      setState((prev) => ingestHardwarePacket(prev, p));
    },
    createOperation: (op) => {
      let createdId = "";
      mutate((s) => {
        createdId = uid("OP");
        const now = Date.now();
        const initialStatus = op.status || "Reported";
        const confirmedPeople = Math.max(0, op.confirmedPeople || 0);
        const rescuedCount = Math.max(0, op.rescuedCount || 0);
        const newOp: RescueOperation = {
          ...op,
          id: createdId,
          status: initialStatus,
          reportedAt: op.reportedAt || now,
          confirmedAt: op.confirmedAt ?? (initialStatus !== "Reported" ? now : null),
          rescueStartedAt:
            op.rescueStartedAt ?? (initialStatus === "Rescue In Progress" ? now : null),
          rescueCompletedAt: op.rescueCompletedAt ?? (initialStatus === "Resolved" ? now : null),
          confirmedPeople,
          rescuedCount,
          awaitingRescue: Math.max(0, confirmedPeople - rescuedCount),
          lastUpdated: now,
          history: [
            {
              id: uid("HIST"),
              ts: now,
              toStatus: initialStatus,
              note: `Operation registered: ${op.title}`,
              operator: "Command Console",
            },
          ],
        };
        s.operations = [newOp, ...s.operations];
        log(s, "info", "OPERATIONS", `Rescue operation ${createdId} (${op.title}) registered`);
        appendEvent(s, {
          type: "operation_created",
          severity: "info",
          source: "RESCUE_OPS",
          message: `Rescue operation ${createdId} (${op.title}) registered`,
          operationId: createdId,
        });
      });
      return { success: true, id: createdId };
    },
    updateOperationStatus: (id, toStatus, note, operator = "Command Console") => {
      let result: { success: boolean; error?: string } = { success: false };
      mutate((s) => {
        const op = s.operations.find((o) => o.id === id);
        if (!op) {
          result = { success: false, error: `Operation ${id} not found` };
          return;
        }
        const check = canTransitionStatus(op.status, toStatus);
        if (!check.allowed) {
          result = { success: false, error: check.reason || "Illegal status transition" };
          log(s, "warn", "OPERATIONS", `Rejected transition for ${id}: ${check.reason}`);
          return;
        }
        const now = Date.now();
        const fromStatus = op.status;
        op.status = toStatus;
        op.lastUpdated = now;
        if (toStatus === "Under Investigation" && !op.confirmedAt) {
          op.confirmedAt = now;
        } else if (toStatus === "Rescue In Progress" && !op.rescueStartedAt) {
          op.rescueStartedAt = now;
        } else if (toStatus === "Resolved") {
          if (!op.rescueCompletedAt) op.rescueCompletedAt = now;
          op.awaitingRescue = Math.max(0, op.confirmedPeople - op.rescuedCount);
        }
        op.history = [
          ...op.history,
          {
            id: uid("HIST"),
            ts: now,
            fromStatus,
            toStatus,
            note: note || `Status updated to ${toStatus}`,
            operator,
          },
        ];
        log(
          s,
          "info",
          "OPERATIONS",
          `Operation ${id} transitioned from ${fromStatus} to ${toStatus}`,
        );
        appendEvent(s, {
          type: "operation_status_changed",
          severity: "info",
          source: "RESCUE_OPS",
          message: `Operation ${id} transitioned from '${fromStatus}' to '${toStatus}'`,
          operationId: id,
        });
        result = { success: true };
      });
      return result;
    },
    updateOperation: (id, patch) => {
      mutate((s) => {
        const op = s.operations.find((o) => o.id === id);
        if (!op) return;
        Object.assign(op, patch);
        op.lastUpdated = Date.now();
        if (patch.confirmedPeople !== undefined || patch.rescuedCount !== undefined) {
          op.awaitingRescue = Math.max(0, op.confirmedPeople - op.rescuedCount);
        }
        log(s, "info", "OPERATIONS", `Operation ${id} parameters updated`);
      });
    },
    addConfirmedSurvivor: (record) => {
      let id = "";
      mutate((s) => {
        id = uid("SURV");
        const surv: ConfirmedSurvivorRecord = {
          ...record,
          id,
          confirmedAt: record.confirmedAt || Date.now(),
          rescuedAt: record.status === "rescued" ? Date.now() : null,
        };
        s.survivors = [surv, ...s.survivors];
        if (surv.operationId) {
          const op = s.operations.find((o) => o.id === surv.operationId);
          if (op) {
            op.confirmedPeople += 1;
            if (surv.status === "rescued") op.rescuedCount += 1;
            op.awaitingRescue = Math.max(0, op.confirmedPeople - op.rescuedCount);
            op.lastUpdated = Date.now();
          }
        }
        log(s, "info", "SURVIVOR", `Confirmed survivor recorded: ${surv.nameOrIdentifier}`);
        appendEvent(s, {
          type: "casualty_registered",
          severity: "warning",
          source: "SURVIVORS",
          message: `Casualty ${id} (${surv.nameOrIdentifier}) recorded via ${surv.confirmationSource}`,
          ...(surv.operationId ? { operationId: surv.operationId } : {}),
        });
      });
      return { id };
    },
    updateSurvivorStatus: (id, status) => {
      mutate((s) => {
        const surv = s.survivors.find((x) => x.id === id);
        if (!surv) return;
        const before = surv.status;
        surv.status = status;
        if (status === "rescued" && !surv.rescuedAt) {
          surv.rescuedAt = Date.now();
        }
        if (surv.operationId && before !== status) {
          const op = s.operations.find((o) => o.id === surv.operationId);
          if (op) {
            if (status === "rescued") {
              op.rescuedCount = Math.min(op.confirmedPeople, op.rescuedCount + 1);
            } else {
              op.rescuedCount = Math.max(0, op.rescuedCount - 1);
            }
            op.awaitingRescue = Math.max(0, op.confirmedPeople - op.rescuedCount);
            op.lastUpdated = Date.now();
          }
        }
        log(s, "info", "SURVIVOR", `Survivor ${id} status updated to ${status}`);
        appendEvent(s, {
          type: "casualty_status_changed",
          severity: "info",
          source: "SURVIVORS",
          message: `Casualty ${id} status changed from '${before}' to '${status}'`,
          ...(surv.operationId ? { operationId: surv.operationId } : {}),
        });
      });
    },
    clearPersistedData: () => {
      clearPersistedOperationalData();
      mutate((s) => {
        s.operations = s.mode === "simulation" ? seedRescueOperations() : [];
        s.survivors = s.mode === "simulation" ? seedConfirmedSurvivors() : [];
        s.events = s.mode === "simulation" ? seedInitialEvents() : [];
        log(s, "info", "STORE", "Persisted local operational data cleared");
      });
    },
    ingestEnhancedPacket: (packet) => {
      const validation = validateEnhancedTelemetry(packet, seenSeqs.current);
      if (!validation.valid || !validation.packet) {
        mutate((s) => {
          log(s, "warn", "INGEST", `Enhanced packet quarantined: ${validation.error}`);
          alert(
            s,
            "Telemetry Quarantined",
            validation.error || "Malformed payload",
            packet.deviceId || "UNKNOWN",
          );
        });
        return { accepted: false, error: validation.error };
      }
      seenSeqs.current.add(`${packet.deviceId}:${packet.seq}`);
      const p = validation.packet;
      api.ingestPacket({
        nodeId: p.deviceId,
        latitude: p.gps?.lat ?? SITE_ORIGIN.lat,
        longitude: p.gps?.lon ?? SITE_ORIGIN.lon,
        sound: p.measurements.sound_db,
        vibration: p.measurements.vibration_g,
        temperature: p.measurements.thermal_c,
        bleDetected: 1,
        wifiDetected: 0,
        rssi: p.rssi,
        battery: p.battery,
        timestamp: p.timestamp,
        loraRssi: -75,
        loraSnr: 9,
        seq: p.seq,
        gatewayId: p.gatewayId,
        gpsFix: p.gps?.fixStatus ?? "none",
        hdop: p.gps?.hdop ?? 1.2,
      });
      return { accepted: true };
    },
    setSelectedNodeId: (id) =>
      mutate((s) => {
        s.selectedNodeId = id;
      }),
    saveBaselineRun: () =>
      mutate((s) => {
        const activeNodes = s.nodes
          .filter((n) => n.status !== "offline" && n.type !== "gateway")
          .map((n) => n.id);
        const primaryZone = s.zones[0] ?? null;
        s.baselineRun = {
          id: uid("RUN-BASE"),
          timestamp: Date.now(),
          scenario: s.scenario,
          seed: 20261012,
          noise: s.noise,
          obstruction: s.obstruction,
          packetLoss: s.packetLoss,
          activeNodes,
          activeNodeIds: activeNodes,
          zoneLat: primaryZone ? primaryZone.lat : null,
          zoneLon: primaryZone ? primaryZone.lon : null,
          radius: primaryZone ? primaryZone.radius : null,
          confidence: primaryZone ? primaryZone.confidence : null,
          residual: primaryZone ? primaryZone.residual : null,
          geometryScore: primaryZone ? (primaryZone.geometryScore ?? null) : null,
          estimatorVersion: primaryZone?.estimatorVersion ?? ESTIMATOR_VERSION,
        };
        appendEvent(s, {
          type: "simulation_baseline_saved",
          severity: "info",
          source: "SIMULATION",
          message: `Simulation baseline snapshot saved (${s.scenario.toUpperCase()}, noise: ${s.noise}dB, loss: ${s.packetLoss}%)`,
        });
        log(s, "info", "SIM", "Simulation baseline snapshot saved for comparative evaluation");
      }),
    clearBaselineRun: () =>
      mutate((s) => {
        s.baselineRun = null;
      }),
    runEstimationPass: () => {
      setState((p) => advanceRef.current(p, true));
    },
    appendAppEvent: (ev) =>
      mutate((s) => {
        appendEvent(s, ev);
      }),
    currentUser,
    serverReady,
    sseConnected,
    loginUser,
    logoutUser,
    switchUserRole,
  };

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useKavach() {
  const value = useContext(Ctx);
  if (!value) throw new Error("KavachProvider is required");
  return value;
}
