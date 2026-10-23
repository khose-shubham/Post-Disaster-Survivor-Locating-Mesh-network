import {
  buildEvidence,
  clamp,
  distanceToRssi,
  localizeWithDiagnostics,
  metresBetween,
  offsetMetres,
  priorityOf,
  rssiToDistance,
  runEstimationPipeline,
  scoreEvidence,
  ESTIMATOR_VERSION,
  type LocalizationInput,
} from "./engine.ts";
import type {
  AlertItem,
  AppEvent,
  AppEventType,
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
} from "./types.ts";

export const SITE_ORIGIN = { lat: 19.8762, lon: 74.4785 };
export const DEFAULT_CALIBRATION: CalibrationSettings = {
  refRssi: -48,
  pathLossExponent: 2.7,
  minRadius: 8,
  maxRadius: 120,
};

export type EstimationState =
  | "no_observations"
  | "observations_invalid"
  | "insufficient_evidence"
  | "localization_unavailable"
  | "active_zone"
  | "device_disconnected"
  | "data_source_unavailable"
  | "insufficient_observations"
  | "unsupported_localization";

export interface Incident {
  id: string;
  name: string;
  disaster: string;
  location: string;
  commander: string;
  notes: string;
  status: "active" | "paused" | "closed";
  created: number;
  timeline: string[];
  lastUpdated?: number;
  sector?: string;
  assignedResponder?: string;
  lat?: number;
  lon?: number;
  radius_m?: number;
}

export interface SimSignal {
  id: string;
  x: number;
  y: number;
  strength: number;
  path: "stationary" | "east-west" | "orbit";
  kind: "survivor" | "noise";
}

export interface Sample {
  tick: number;
  time: string;
  detections: number;
  rssi: number;
  online: number;
  battery: number;
  received: number;
  lost: number;
  confidence: number;
  radius: number;
  error: number | null;
}

export type SceneScenario = "collapse" | "flood" | "industrial";

export const SCENARIO_PRESETS: Record<
  SceneScenario,
  {
    name: string;
    noise: number;
    obstruction: number;
    description: string;
    signalOrigin: {
      id: string;
      x: number;
      y: number;
      kind: "survivor" | "noise";
      path: "stationary" | "east-west" | "orbit";
    };
  }
> = {
  collapse: {
    name: "Structural Collapse",
    noise: 2,
    obstruction: 2,
    description:
      "Reinforced concrete slab failure with heavy debris, void pockets, and moderate multipath attenuation.",
    signalOrigin: { id: "SYN-01", x: 20, y: 15, kind: "survivor", path: "stationary" },
  },
  flood: {
    name: "Flood Response",
    noise: 4,
    obstruction: 4,
    description:
      "Inundated urban sector with surface water reflections, moving flotsam, and mobile casualty drift along currents.",
    signalOrigin: { id: "SYN-FLD-01", x: -40, y: 30, kind: "survivor", path: "east-west" },
  },
  industrial: {
    name: "Industrial Obstruction",
    noise: 7,
    obstruction: 12,
    description:
      "Complex manufacturing plant with heavy steel framing, electromagnetic motors, and severe RF attenuation.",
    signalOrigin: { id: "SYN-IND-01", x: 50, y: -45, kind: "survivor", path: "orbit" },
  },
};

export interface State {
  sceneMode: "2d" | "3d";
  scenario: SceneScenario;
  running: boolean;
  mode: "simulation" | "live";
  bootstrapped: boolean;
  nodes: SensorNode[];
  detections: Detection[];
  zones: SearchZone[];
  alerts: AlertItem[];
  logs: LogEvent[];
  events: AppEvent[];
  calibration: CalibrationSettings;
  tick: number;
  rate: number;
  noise: number;
  obstruction: number;
  packetLoss: number;
  expiry: number;
  signal: SimSignal | null;
  samples: Sample[];
  incidents: Incident[];
  incidentId: string;
  operations: RescueOperation[];
  survivors: ConfirmedSurvivorRecord[];
  gatewayConnected: boolean;
  apiUrl: string;
  apiStatus: string;
  apiTimestamp: number | null;
  estimationState: EstimationState;
  estimationMessage: string;
  estimationReport: EstimationPipelineReport | null;
  selectedNodeId: string | null;
  baselineRun: SimulationRunSnapshot | null;
}

let sequence = 0;
export const uid = (prefix: string) => `${prefix}-${++sequence}`;

export function canTransitionStatus(
  from: RescueOperationStatus,
  to: RescueOperationStatus,
): { allowed: boolean; reason?: string } {
  if (from === to) {
    return { allowed: false, reason: "Operation is already in this status" };
  }

  // Valid forward sequence: Reported -> Under Investigation -> Rescue In Progress -> Resolved
  if (from === "Reported") {
    if (to === "Under Investigation") return { allowed: true };
    return {
      allowed: false,
      reason: "Operation must be 'Under Investigation' before starting rescue or resolving",
    };
  }

  if (from === "Under Investigation") {
    if (to === "Rescue In Progress") return { allowed: true };
    if (to === "Reported") return { allowed: true }; // Rollback allowed if unverified
    return {
      allowed: false,
      reason: "Investigation must enter 'Rescue In Progress' before being resolved",
    };
  }

  if (from === "Rescue In Progress") {
    if (to === "Resolved") return { allowed: true };
    if (to === "Under Investigation") return { allowed: true }; // Stand-down or reassessment
    return {
      allowed: false,
      reason: "Active rescue cannot jump directly back to 'Reported'",
    };
  }

  if (from === "Resolved") {
    // Reopening resolved operation requires explicit justification
    if (to === "Under Investigation") return { allowed: true };
    return {
      allowed: false,
      reason: "Resolved operation can only be reopened to 'Under Investigation'",
    };
  }

  return { allowed: false, reason: `Unknown transition from ${from} to ${to}` };
}

export function getRescueIntervals(op: RescueOperation): {
  reportToConfirmMs: number | null;
  confirmToStartMs: number | null;
  rescueDurationMs: number | null;
  totalDurationMs: number | null;
} {
  const reportToConfirmMs =
    op.confirmedAt != null && op.confirmedAt >= op.reportedAt
      ? op.confirmedAt - op.reportedAt
      : null;

  const confirmToStartMs =
    op.rescueStartedAt != null && op.confirmedAt != null && op.rescueStartedAt >= op.confirmedAt
      ? op.rescueStartedAt - op.confirmedAt
      : null;

  const rescueDurationMs =
    op.rescueCompletedAt != null &&
    op.rescueStartedAt != null &&
    op.rescueCompletedAt >= op.rescueStartedAt
      ? op.rescueCompletedAt - op.rescueStartedAt
      : null;

  const totalDurationMs =
    op.rescueCompletedAt != null && op.reportedAt != null && op.rescueCompletedAt >= op.reportedAt
      ? op.rescueCompletedAt - op.reportedAt
      : null;

  return {
    reportToConfirmMs,
    confirmToStartMs,
    rescueDurationMs,
    totalDurationMs,
  };
}

export function validateEnhancedTelemetry(
  raw: unknown,
  seenSeqs?: Set<string>,
): { valid: boolean; error?: string; packet?: EnhancedTelemetryPacket } {
  if (!raw || typeof raw !== "object") {
    return { valid: false, error: "Packet is null or not an object" };
  }
  const p = raw as Partial<EnhancedTelemetryPacket>;

  if (typeof p.deviceId !== "string" || !p.deviceId.trim()) {
    return { valid: false, error: "Missing or invalid deviceId" };
  }
  if (!Number.isFinite(p.timestamp)) {
    return { valid: false, error: "Missing or non-finite timestamp" };
  }
  const now = Date.now();
  const tsMs =
    (p.timestamp as number) < 2e9 ? (p.timestamp as number) * 1000 : (p.timestamp as number);
  if (tsMs > now + 300000) {
    return { valid: false, error: "Timestamp is too far in future" };
  }
  if (!Number.isFinite(p.seq)) {
    return { valid: false, error: "Missing or non-finite sequence number (seq)" };
  }
  if (seenSeqs) {
    const key = `${p.deviceId}:${p.seq}`;
    if (seenSeqs.has(key)) {
      return {
        valid: false,
        error: `Duplicate packet sequence #${p.seq} for device ${p.deviceId}`,
      };
    }
  }
  if (!Number.isFinite(p.rssi) || (p.rssi as number) > 0 || (p.rssi as number) < -150) {
    return { valid: false, error: "RSSI out of valid range (-150 to 0 dBm)" };
  }
  if (!Number.isFinite(p.battery) || (p.battery as number) < 0 || (p.battery as number) > 100) {
    return { valid: false, error: "Battery percentage out of range (0-100%)" };
  }
  if (!p.measurements || typeof p.measurements !== "object") {
    return { valid: false, error: "Missing physical sensor measurements object" };
  }
  const m = p.measurements;
  if (
    !Number.isFinite(m.sound_db) ||
    !Number.isFinite(m.vibration_g) ||
    !Number.isFinite(m.thermal_c)
  ) {
    return { valid: false, error: "Non-finite measurement values in physical telemetry" };
  }

  if (p.gps) {
    if (!Number.isFinite(p.gps.lat) || !Number.isFinite(p.gps.lon)) {
      return { valid: false, error: "Non-finite GPS coordinates" };
    }
    if (p.gps.lat < -90 || p.gps.lat > 90 || p.gps.lon < -180 || p.gps.lon > 180) {
      return { valid: false, error: "GPS coordinates outside valid geographic range" };
    }
  }

  return {
    valid: true,
    packet: {
      deviceId: p.deviceId,
      gatewayId: p.gatewayId || "GW-N04",
      timestamp: tsMs,
      seq: p.seq as number,
      gps: p.gps
        ? {
            lat: p.gps.lat,
            lon: p.gps.lon,
            alt: p.gps.alt,
            hdop: p.gps.hdop,
            fixStatus: p.gps.fixStatus || "3d",
          }
        : null,
      rssi: p.rssi as number,
      measurements: {
        sound_db: m.sound_db,
        vibration_g: m.vibration_g,
        thermal_c: m.thermal_c,
      },
      battery: p.battery as number,
      source: p.source === "live" ? "live" : "sim",
      dataQuality: p.dataQuality || "valid",
    },
  };
}

export function seedRescueOperations(): RescueOperation[] {
  return [
    {
      id: "OP-001",
      incidentId: "INC-001",
      zoneId: "ZONE-01",
      sector: "Sector Delta · Void 2",
      title: "Collapsed Stairwell Void Extraction",
      reportedAt: 1773756000000,
      confirmedAt: 1773757200000,
      rescueStartedAt: 1773758400000,
      rescueCompletedAt: null,
      confirmedPeople: 1,
      rescuedCount: 0,
      awaitingRescue: 1,
      status: "Rescue In Progress",
      evidenceSource: "Acoustic Geophone & BLE Beacon Triangulation",
      lastUpdated: 1773758400000,
      notes: "Shoring installed at void entrance. Canine cross-check confirmed living subject.",
      history: [
        {
          id: "HIST-01",
          ts: 1773756000000,
          toStatus: "Reported",
          note: "Anonymous crowd signal triangulated near Sector Delta stairwell.",
          operator: "Tactical Console OP-01",
        },
        {
          id: "HIST-02",
          ts: 1773757200000,
          fromStatus: "Reported",
          toStatus: "Under Investigation",
          note: "Ground SAR team dispatched with acoustic listening wand and search canine.",
          operator: "Capt. Deshmukh",
        },
        {
          id: "HIST-03",
          ts: 1773758400000,
          fromStatus: "Under Investigation",
          toStatus: "Rescue In Progress",
          note: "Vocal response confirmed beneath precast slab. Heavy rescue shoring commenced.",
          operator: "Capt. Deshmukh",
        },
      ],
    },
  ];
}

export function seedConfirmedSurvivors(): ConfirmedSurvivorRecord[] {
  return [
    {
      id: "SURV-001",
      incidentId: "INC-001",
      operationId: "OP-001",
      zoneId: "ZONE-01",
      nameOrIdentifier: "Subject Alpha (Female, ~35y)",
      status: "awaiting_rescue",
      confirmedAt: 1773757200000,
      rescuedAt: null,
      confirmationSource: "Canine SAR Cross-Check",
      locationDescription: "Collapsed second-floor stairwell landing, beneath hollow-core slab",
      medicalUrgency: "urgent",
      notes: "Conscious, responding verbally to tapping. Void temperature 29°C.",
    },
  ];
}

export function seedNodes(): SensorNode[] {
  return [
    [-120, 90],
    [130, 105],
    [145, -110],
    [-135, -95],
  ].map(([x, y], i) => ({
    id: `N0${i + 1}`,
    label:
      ["Northwest perimeter", "Stairwell / Sector B", "Parking slab / Sector C", "Command gateway"][
        i
      ] ?? "Sensor",
    ...offsetMetres(SITE_ORIGIN, x ?? 0, y ?? 0),
    type: i === 3 ? "gateway" : "sniffer",
    status: "online",
    battery: [88, 76, 64, 93][i] ?? 80,
    sound: 34 + i,
    vibration: 0.04,
    temperature: 27.4 + i * 0.3,
    bleDetected: 0,
    wifiDetected: 0,
    rssi: -95,
    loraRssi: -72 - i * 4,
    loraSnr: 9.5 - i * 1.2,
    lastPacket: 0,
    sensorHealth: { gps: "ok", mic: "ok", vibration: "ok", thermal: "ok", lora: "ok" },
    hops: i === 3 ? 0 : 1,
    firmware: "trace-demo 1.0",
    uptime: 0,
    packetsReceived: 0,
    packetsLost: 0,
  }));
}

export function seedInitialEvents(): AppEvent[] {
  return [
    {
      id: "EVT-001",
      ts: 1773755400000,
      type: "incident_created",
      severity: "info",
      source: "INCIDENT",
      message: "Incident INC-001 (Disaster Zone · Sector Delta) registered by Tactical Command",
      incidentId: "INC-001",
    },
    {
      id: "EVT-002",
      ts: 1773756000000,
      type: "operation_created",
      severity: "info",
      source: "RESCUE_OPS",
      message: "Rescue Operation OP-001 (Collapsed Stairwell Void Extraction) initialized",
      incidentId: "INC-001",
      operationId: "OP-001",
    },
    {
      id: "EVT-003",
      ts: 1773757200000,
      type: "casualty_registered",
      severity: "warning",
      source: "SURVIVORS",
      message: "Confirmed Casualty SURV-001 (Subject Alpha) logged via Canine SAR Cross-Check",
      incidentId: "INC-001",
      operationId: "OP-001",
    },
    {
      id: "EVT-004",
      ts: 1773758400000,
      type: "operation_status_changed",
      severity: "info",
      source: "RESCUE_OPS",
      message: "OP-001 transitioned from 'Under Investigation' to 'Rescue In Progress'",
      incidentId: "INC-001",
      operationId: "OP-001",
    },
    {
      id: "EVT-005",
      ts: 1773758410000,
      type: "zone_generated",
      severity: "info",
      source: "ESTIMATOR",
      message: "Search Zone ZONE-01 generated by TRACE-EST-V6.1-GDOP (residual 1.4m, radius ±18m)",
      incidentId: "INC-001",
      zoneId: "ZONE-01",
    },
  ];
}

export function initialState(): State {
  return {
    sceneMode: "3d",
    scenario: "collapse",
    running: true,
    mode: "simulation",
    bootstrapped: true,
    nodes: seedNodes(),
    detections: [],
    zones: [],
    alerts: [],
    logs: [],
    events: seedInitialEvents(),
    calibration: DEFAULT_CALIBRATION,
    tick: 0,
    rate: 2500,
    noise: 2,
    obstruction: 2,
    packetLoss: 0,
    expiry: 30,
    signal: { id: "SYN-01", x: 20, y: 15, strength: 0, path: "stationary", kind: "survivor" },
    samples: [],
    incidents: [
      {
        id: "INC-001",
        name: "Disaster Zone · Sector Delta",
        disaster: "Structural collapse",
        location: "Sector Delta Operations Area",
        commander: "Demo operator",
        notes: "Synthetic training exercise. No field deployment.",
        status: "active",
        created: 0,
        timeline: ["Training incident created"],
        lastUpdated: 1773758400000,
        sector: "Sector Delta",
        assignedResponder: "Team Alpha (SAR)",
      },
    ],
    incidentId: "INC-001",
    operations: seedRescueOperations(),
    survivors: seedConfirmedSurvivors(),
    gatewayConnected: true,
    apiUrl: "",
    apiStatus: "Not configured",
    apiTimestamp: null,
    estimationState: "active_zone",
    estimationMessage: "Simulation active · synthetic telemetry generating probable search zone",
    estimationReport: null,
    selectedNodeId: null,
    baselineRun: null,
  };
}

export function switchScenario(
  prev: State,
  targetScenario: SceneScenario,
  random: () => number,
): State {
  if (prev.mode !== "simulation") return prev;
  const preset = SCENARIO_PRESETS[targetScenario];
  const s: State = {
    ...prev,
    scenario: targetScenario,
    noise: preset.noise,
    obstruction: preset.obstruction,
    packetLoss: 0,
    signal: {
      ...preset.signalOrigin,
      strength: 0,
    },
    // Flush previous scenario observations and zones to guarantee zero stale data leakage
    detections: [],
    zones: [],
    samples: [],
    alerts: prev.alerts.filter((a) => a.kind === "node"),
    tick: 0,
    nodes: prev.nodes.map((n) => ({
      ...n,
      packetsReceived: 0,
      packetsLost: 0,
      rssi: -95,
      bleDetected: 0,
      wifiDetected: 0,
    })),
    events: [
      {
        id: uid("evt-app"),
        ts: Date.now(),
        type: "scenario_switched" as const,
        severity: "info" as const,
        source: "SIMULATION",
        message: `Disaster scenario switched to ${preset.name} (RF Noise: ${preset.noise} dB, Obstruction: ${preset.obstruction} dB)`,
        incidentId: prev.incidentId,
      },
      ...prev.events,
    ].slice(0, 300),
    logs: [
      {
        id: uid("evt"),
        ts: Date.now(),
        level: "info" as const,
        source: "SIM",
        message: `Scenario switched to ${preset.name} · Previous synthetic telemetry flushed`,
        incidentId: prev.incidentId,
      },
      ...prev.logs,
    ].slice(0, 400),
  };
  return advanceSimulation(s, random, true);
}

export function advanceSimulation(prev: State, random: () => number, recalculate = false): State {
  if (prev.mode !== "simulation") return prev;
  const s: State = {
    ...prev,
    nodes: prev.nodes.map((n) => ({ ...n })),
    logs: [...prev.logs],
    alerts: [...prev.alerts],
    events: [...prev.events],
    tick: prev.tick + (recalculate ? 0 : 1),
  };
  const now = Date.now(),
    jitter = (v: number) => (random() - 0.5) * 2 * v;
  let source = s.signal;
  if (!recalculate && source && source.path !== "stationary") {
    const t = s.tick * 0.035;
    source = {
      ...source,
      x: source.path === "orbit" ? Math.cos(t) * 65 : Math.sin(t) * 100,
      y: source.path === "orbit" ? Math.sin(t) * 65 : source.y,
    };
    s.signal = source;
  }
  const position = source ? offsetMetres(SITE_ORIGIN, source.x, source.y) : null;
  const transport =
    s.gatewayConnected && s.nodes.some((n) => n.type === "gateway" && n.status !== "offline");
  const observations: LocalizationInput[] = [];
  const fresh: Detection[] = [];
  for (const n of s.nodes) {
    if (n.status === "offline") {
      if (!recalculate) n.packetsLost = (n.packetsLost ?? 0) + 1;
      continue;
    }
    if (!recalculate) {
      n.lastPacket = now;
      n.uptime = (n.uptime ?? 0) + s.rate / 1000;
      n.battery = clamp(n.battery - 0.005, 0, 100);
    }
    n.loraRssi = clamp(-72 - Number(n.id.slice(1)) * 2 + jitter(2), -120, -55);
    n.loraSnr = 8 + jitter(1);
    if (!recalculate) {
      n.packetsReceived = (n.packetsReceived ?? 0) + (transport ? 1 : 0);
      n.packetsLost = (n.packetsLost ?? 0) + (transport ? 0 : 1);
    }
    n.sound = clamp(34 + jitter(2) + (source?.kind === "survivor" ? 15 : 0), 30, 95);
    n.vibration = 0.04 + (source?.kind === "survivor" ? 0.18 : Math.abs(jitter(0.06)));
    n.temperature = 27.4 + (source?.kind === "survivor" ? 3 : 0) + jitter(0.3);
    n.bleDetected = position && n.type !== "gateway" ? 1 : 0;
    n.wifiDetected = 0;

    // Simulate configurable packet loss over wireless link
    const packetLost = s.packetLoss > 0 && random() * 100 < s.packetLoss;
    if (packetLost && !recalculate) {
      n.packetsLost = (n.packetsLost ?? 0) + 1;
      n.rssi = -96 + jitter(3);
      continue;
    }

    if (position && source && n.type !== "gateway") {
      n.rssi = clamp(
        distanceToRssi(metresBetween(n, position), s.calibration) +
          source.strength -
          s.obstruction +
          jitter(s.noise + (source.kind === "noise" ? 8 : 0)),
        -125,
        -35,
      );
      const history = (recalculate ? [] : prev.detections)
        .filter((d) => d.nodeId === n.id && now - d.ts < s.expiry * 1000)
        .slice(0, 5);
      const values = [n.rssi, ...history.map((d) => d.rssi)];
      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
      if (transport)
        observations.push({ nodeId: n.id, lat: n.lat, lon: n.lon, rssi: mean, variance, age: 0 });
      if (transport)
        fresh.push({
          id: uid("obs"),
          ts: now,
          nodeId: n.id,
          signalType: source.kind === "noise" ? "Wi-Fi" : "BLE",
          tempId: source.id,
          rssi: Math.round(n.rssi),
          distance: Math.round(rssiToDistance(n.rssi, s.calibration)),
          persistence: source.kind === "noise" ? 0.3 : 0.85,
          status: "tracking",
          sourceMode: "simulation",
          dataQuality: "valid",
          measurements: {
            sound_db: Math.round(n.sound * 10) / 10,
            vibration_g: Math.round(n.vibration * 1000) / 1000,
            thermal_c: Math.round(n.temperature * 10) / 10,
          },
          incidentId: s.incidentId,
        });
    } else n.rssi = -96 + jitter(3);
    if (n.battery < 20) {
      if (!s.alerts.some((a) => a.target === n.id && !a.acknowledged)) {
        s.alerts = [
          {
            id: uid("alert"),
            ts: Date.now(),
            kind: "node" as const,
            severity: "warning" as const,
            title: "Low battery",
            reason: `${n.id} requires a battery check`,
            target: n.id,
            acknowledged: false,
            incidentId: s.incidentId,
          },
          ...s.alerts,
        ].slice(0, 100);
      }
    }
  }

  // Run transparent estimation pipeline
  const pipelineReport =
    source && transport
      ? runEstimationPipeline(observations, s.calibration, s.mode)
      : {
          timestamp: now,
          sourceMode: s.mode,
          estimatorVersion: ESTIMATOR_VERSION,
          totalInputObservations: observations.length,
          usableObservationCount: 0,
          rejectedObservations: [],
          contributingNodes: [],
          eligibilityStatus: !transport
            ? ("device_disconnected" as const)
            : !source
              ? ("no_observations" as const)
              : ("insufficient_evidence" as const),
          positionEstimateProduced: false,
          result: null,
          warnings: !transport ? ["Gateway transport disconnected"] : ["Signal generator idle"],
          limitations: ["No valid position estimate produced."],
        };

  s.estimationReport = pipelineReport;
  const fix = pipelineReport.result;

  // Annotate detections with contribution and rejection status
  for (const d of fresh) {
    d.usedInEstimate = fix ? fix.nodes.includes(d.nodeId) : false;
    if (!d.usedInEstimate) {
      if (!transport) d.rejectionReason = "Gateway transport offline";
      else if (
        pipelineReport.rejectedObservations.some(
          (r: { nodeId: string; reason: string }) => r.nodeId === d.nodeId,
        )
      ) {
        d.rejectionReason = pipelineReport.rejectedObservations.find(
          (r: { nodeId: string; reason: string }) => r.nodeId === d.nodeId,
        )?.reason;
      } else if (!fix) {
        d.rejectionReason = pipelineReport.warnings[0] ?? "Insufficient reporting nodes";
      }
    }
  }

  s.detections = [
    ...fresh,
    ...(recalculate
      ? prev.detections.map((d) => ({ ...d, status: "lost" as const }))
      : prev.detections),
  ]
    .slice(0, 600)
    .map((d) => ({ ...d, status: now - d.ts > s.expiry * 1000 ? "lost" : d.status }));

  if (fix) {
    const evidence = buildEvidence(
      s.nodes.filter((n) => n.type !== "gateway"),
      source?.kind === "noise" ? 0.3 : 0.85,
    );
    const score = scoreEvidence(evidence);
    s.zones = [
      {
        id: "ZONE-01",
        ts: now,
        lat: fix.lat,
        lon: fix.lon,
        radius: Math.round(fix.radius),
        score,
        priority: priorityOf(score),
        evidence,
        contributingNodes: fix.nodes,
        note: "Potential search zone · supporting evidence only",
        confidence: fix.confidence,
        residual: fix.residual,
        incidentId: s.incidentId,
        geometryScore: pipelineReport.geometryScore,
        inputObservationCount: pipelineReport.totalInputObservations,
        usableObservationCount: pipelineReport.usableObservationCount,
        rejectedObservationCount: pipelineReport.rejectedObservations.length,
        sourceMode: s.mode,
        estimatorVersion: pipelineReport.estimatorVersion,
        warnings: pipelineReport.warnings,
      },
    ];
    s.estimationState = "active_zone";
    s.estimationMessage = `Potential search zone updated · heuristic ${fix.confidence}% · radius ±${Math.round(fix.radius)} m`;
    s.logs = [
      {
        id: uid("evt"),
        ts: Date.now(),
        level: "info" as const,
        source: "ESTIMATOR",
        message: s.estimationMessage,
        incidentId: s.incidentId,
      },
      ...s.logs,
    ].slice(0, 400);

    // Record AppEvent if first zone or position shifted
    if (!recalculate && (!prev.zones[0] || metresBetween(prev.zones[0], fix) > 10)) {
      s.events = [
        {
          id: uid("evt-app"),
          ts: now,
          type: "zone_generated" as const,
          severity: "info" as const,
          source: "ESTIMATOR",
          message: `Probable search zone calculated (radius ±${Math.round(fix.radius)}m, confidence ${fix.confidence}%)`,
          incidentId: s.incidentId,
          zoneId: "ZONE-01",
        },
        ...s.events,
      ].slice(0, 300);
    }
  } else {
    s.zones = [];
    if (!transport) {
      s.estimationState = "device_disconnected";
      s.estimationMessage = "Observation transport unavailable · Simulated gateway offline";
    } else if (!source) {
      s.estimationState = "no_observations";
      s.estimationMessage = "No active synthetic source · Signal generator idle";
    } else if (
      pipelineReport.rejectedObservations.some(
        (r: { nodeId: string; reason: string }) =>
          r.reason.includes("collinear") || r.reason.includes("duplicate"),
      ) ||
      pipelineReport.eligibilityStatus === "localization_unavailable"
    ) {
      s.estimationState = "unsupported_localization";
      s.estimationMessage = `Localization unresolvable · ${pipelineReport.warnings[0] ?? "spatial ambiguity prevents 2D fix"}`;
    } else {
      s.estimationState = "insufficient_observations";
      s.estimationMessage =
        pipelineReport.warnings[0] ??
        `Insufficient node observations · ${observations.length} reporting (minimum 3 required)`;
    }
    if (source) {
      s.logs = [
        {
          id: uid("evt"),
          ts: Date.now(),
          level: "warn" as const,
          source: "ESTIMATOR",
          message: s.estimationMessage,
          incidentId: s.incidentId,
        },
        ...s.logs,
      ].slice(0, 400);
    }
  }

  const online = s.nodes.filter((n) => n.status !== "offline");
  s.samples = [
    ...(recalculate ? prev.samples.slice(0, -1) : prev.samples),
    {
      tick: s.tick,
      time: new Date(now).toLocaleTimeString("en-GB"),
      detections: fresh.length,
      rssi: online.reduce((a, n) => a + n.rssi, 0) / Math.max(1, online.length),
      online: online.length,
      battery: s.nodes.reduce((a, n) => a + n.battery, 0) / Math.max(1, s.nodes.length),
      received: s.nodes.reduce((a, n) => a + (n.packetsReceived ?? 0), 0),
      lost: s.nodes.reduce((a, n) => a + (n.packetsLost ?? 0), 0),
      confidence: fix?.confidence ?? 0,
      radius: fix?.radius ?? 0,
      error: fix && position ? metresBetween(fix, position) : null,
    },
  ].slice(-120);

  return s;
}

export function switchMode(
  state: State,
  targetMode: "simulation" | "live",
  simCache: State | null,
  liveCache: Partial<State> | null,
  recalculateFn: (s: State) => State,
): {
  nextState: State;
  newSimCache: State | null;
  newLiveCache: Partial<State> | null;
} {
  if (targetMode === state.mode) {
    return { nextState: state, newSimCache: simCache, newLiveCache: liveCache };
  }

  if (targetMode === "live") {
    // Cache simulation state
    const newSim = state;
    const nextState: State = {
      ...state,
      mode: "live",
      running: false,
      signal: null, // Clear synthetic source completely
      nodes: [],
      detections: [],
      zones: [],
      logs: [],
      alerts: [],
      events: state.events,
      samples: [],
      tick: 0,
      operations: [],
      survivors: [],
      gatewayConnected: false,
      estimationState: "no_observations",
      estimationMessage:
        "Live hardware mode active · Awaiting telemetry from gateway and sensor nodes",
      estimationReport: null,
      selectedNodeId: null,
      baselineRun: null,
      ...(liveCache ?? {}),
    };
    return {
      nextState,
      newSimCache: newSim,
      newLiveCache: liveCache,
    };
  } else {
    // Cache current live state
    const newLive: Partial<State> = {
      nodes: state.nodes,
      detections: state.detections,
      zones: state.zones,
      logs: state.logs,
      alerts: state.alerts,
      events: state.events,
      samples: state.samples,
      operations: state.operations,
      survivors: state.survivors,
      tick: state.tick,
      gatewayConnected: state.gatewayConnected,
      estimationState: state.estimationState,
      estimationMessage: state.estimationMessage,
      estimationReport: state.estimationReport,
    };
    const restored: State = simCache
      ? {
          ...simCache,
          sceneMode: state.sceneMode,
          mode: "simulation",
          calibration: state.calibration,
          apiUrl: state.apiUrl,
          apiStatus: state.apiStatus,
          apiTimestamp: state.apiTimestamp,
          selectedNodeId: null,
          baselineRun: null,
        }
      : { ...initialState(), mode: "simulation" };

    return {
      nextState: recalculateFn(restored),
      newSimCache: simCache,
      newLiveCache: newLive,
    };
  }
}

export function ingestHardwarePacket(state: State, packet: TelemetryPacket): State {
  if (state.mode !== "live") return state;
  if (
    !packet ||
    typeof packet.nodeId !== "string" ||
    !packet.nodeId.trim() ||
    !Number.isFinite(packet.rssi) ||
    !Number.isFinite(packet.latitude) ||
    !Number.isFinite(packet.longitude) ||
    !Number.isFinite(packet.timestamp)
  ) {
    return state;
  }

  const s: State = {
    ...state,
    nodes: state.nodes.map((n) => ({ ...n })),
    detections: [...state.detections],
    zones: [...state.zones],
    logs: [...state.logs],
    alerts: [...state.alerts],
    events: [...state.events],
  };

  const ts = packet.timestamp < 2e9 ? packet.timestamp * 1000 : packet.timestamp;
  const now = Date.now();
  if (now - ts > s.expiry * 1000) {
    return state;
  }

  const isGw =
    packet.nodeId.toLowerCase().includes("gw") ||
    packet.nodeId.toLowerCase().includes("gateway") ||
    packet.nodeId === "N04";
  if (isGw) {
    s.gatewayConnected = true;
  }

  let n = s.nodes.find((node) => node.id === packet.nodeId);
  if (!n) {
    n = {
      id: packet.nodeId,
      label: isGw ? "Hardware Gateway" : `Hardware sniffer ${packet.nodeId}`,
      lat: packet.latitude,
      lon: packet.longitude,
      type: isGw ? "gateway" : "sniffer",
      status: "online",
      battery: clamp(packet.battery ?? 100, 0, 100),
      sound: clamp(packet.sound ?? 35, 20, 120),
      vibration: Math.max(0, packet.vibration ?? 0.04),
      temperature: clamp(packet.temperature ?? 28, -20, 80),
      bleDetected: packet.bleDetected ?? 0,
      wifiDetected: packet.wifiDetected ?? 0,
      rssi: clamp(packet.rssi, -125, -20),
      loraRssi: clamp(packet.loraRssi ?? -80, -130, -30),
      loraSnr: clamp(packet.loraSnr ?? 8, -20, 30),
      lastPacket: ts,
      sensorHealth: { gps: "ok", mic: "ok", vibration: "ok", thermal: "ok", lora: "ok" },
      hops: isGw ? 0 : 1,
      firmware: "ESP32-TRACE-HW 1.0",
      uptime: 0,
      packetsReceived: 1,
      packetsLost: 0,
    };
    s.nodes.push(n);
  } else {
    n.lat = packet.latitude;
    n.lon = packet.longitude;
    n.status = "online";
    n.battery = clamp(packet.battery ?? n.battery, 0, 100);
    n.sound = clamp(packet.sound ?? n.sound, 20, 120);
    n.vibration = Math.max(0, packet.vibration ?? n.vibration);
    n.temperature = clamp(packet.temperature ?? n.temperature, -20, 80);
    n.bleDetected = packet.bleDetected ?? n.bleDetected;
    n.wifiDetected = packet.wifiDetected ?? n.wifiDetected;
    n.rssi = clamp(packet.rssi, -125, -20);
    n.loraRssi = clamp(packet.loraRssi ?? n.loraRssi, -130, -30);
    n.loraSnr = clamp(packet.loraSnr ?? n.loraSnr, -20, 30);
    n.lastPacket = ts;
    n.packetsReceived = (n.packetsReceived ?? 0) + 1;
  }

  // Record live detection if signal detected
  if (packet.bleDetected > 0 || packet.wifiDetected > 0) {
    s.detections = [
      {
        id: uid("live-det"),
        ts,
        nodeId: packet.nodeId,
        signalType: packet.wifiDetected > 0 ? ("Wi-Fi" as const) : ("BLE" as const),
        tempId: `LIVE-${packet.nodeId.slice(-3)}`,
        rssi: Math.round(packet.rssi),
        distance: Math.round(rssiToDistance(packet.rssi, s.calibration)),
        persistence: 0.9,
        status: "tracking" as const,
        sourceMode: "live" as const,
        dataQuality: "valid" as const,
        incidentId: s.incidentId,
        measurements: {
          sound_db: packet.sound,
          vibration_g: packet.vibration,
          thermal_c: packet.temperature,
        },
      },
      ...s.detections,
    ].slice(0, 600);
  }

  // Live Multilateration & Search Zone Calculation:
  const freshSniffers = s.nodes.filter(
    (node) =>
      node.type !== "gateway" &&
      node.status !== "offline" &&
      now - node.lastPacket < s.expiry * 1000 &&
      (node.bleDetected > 0 || node.wifiDetected > 0 || node.rssi > -110),
  );

  const liveObs: LocalizationInput[] = freshSniffers.map((node) => ({
    nodeId: node.id,
    lat: node.lat,
    lon: node.lon,
    rssi: node.rssi,
    age: Math.max(0, Math.round((now - node.lastPacket) / 1000)),
  }));

  if (!s.gatewayConnected) {
    s.estimationState = "device_disconnected";
    s.estimationMessage = "Gateway transport offline · Field telemetry cannot reach command";
    s.zones = [];
  } else if (freshSniffers.length === 0) {
    s.estimationState = "no_observations";
    s.estimationMessage = "No active signal observations · Awaiting crowd-signal detection";
    s.zones = [];
  } else if (freshSniffers.length < 3) {
    s.estimationState = "insufficient_observations";
    s.estimationMessage = `Insufficient observations · ${freshSniffers.length} of 3 required reporting sniffers`;
    s.zones = [];
  } else {
    const pipelineReport = runEstimationPipeline(liveObs, s.calibration, "live");
    s.estimationReport = pipelineReport;
    if (pipelineReport.result) {
      const evidence = buildEvidence(freshSniffers, 0.85);
      const score = scoreEvidence(evidence);
      s.zones = [
        {
          id: "ZONE-HW-01",
          ts: now,
          lat: pipelineReport.result.lat,
          lon: pipelineReport.result.lon,
          radius: Math.round(pipelineReport.result.radius),
          score,
          priority: priorityOf(score),
          evidence,
          contributingNodes: pipelineReport.result.nodes,
          note: "Verified hardware probable search zone",
          confidence: pipelineReport.result.confidence,
          residual: pipelineReport.result.residual,
          incidentId: s.incidentId,
          geometryScore: pipelineReport.geometryScore,
          inputObservationCount: pipelineReport.totalInputObservations,
          usableObservationCount: pipelineReport.usableObservationCount,
          rejectedObservationCount: pipelineReport.rejectedObservations.length,
          sourceMode: "live",
          estimatorVersion: pipelineReport.estimatorVersion,
          warnings: pipelineReport.warnings,
        },
      ];
      s.estimationState = "active_zone";
      s.estimationMessage = `Probable search zone calculated from hardware telemetry · Heuristic ${pipelineReport.result.confidence}%`;
    } else {
      s.zones = [];
      if (
        pipelineReport.rejectedObservations.some(
          (r: { nodeId: string; reason: string }) =>
            r.reason.includes("collinear") || r.reason.includes("duplicate"),
        ) ||
        pipelineReport.eligibilityStatus === "localization_unavailable"
      ) {
        s.estimationState = "unsupported_localization";
        s.estimationMessage = `Localization unresolvable · ${pipelineReport.warnings[0] ?? "spatial ambiguity"}`;
      } else {
        s.estimationState = "insufficient_observations";
        s.estimationMessage =
          pipelineReport.warnings[0] ?? "Observations insufficient for spatial fix";
      }
    }
  }

  return s;
}
