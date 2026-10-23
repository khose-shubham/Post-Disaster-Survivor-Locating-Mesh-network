export type NodeId = string;

export type NodeStatus = "online" | "degraded" | "offline";

export interface SensorNode {
  id: NodeId;
  label: string;
  lat: number;
  lon: number;
  status: NodeStatus;
  battery: number; // %
  sound: number; // dB SPL (approx)
  vibration: number; // g (approx)
  temperature: number; // deg C thermal max pixel
  bleDetected: number; // count of temporary device ids
  wifiDetected: number;
  rssi: number; // strongest observed device RSSI (dBm)
  loraRssi: number; // dBm
  loraSnr: number; // dB
  lastPacket: number; // epoch ms
  sensorHealth: Record<string, "ok" | "warn" | "fail">;
  hops: number; // mesh hops to gateway
  type?: "sniffer" | "gateway";
  firmware?: string;
  uptime?: number;
  packetsReceived?: number;
  packetsLost?: number;
  gpsFix?: "3d" | "2d" | "none" | undefined;
  hdop?: number | undefined;
}

export type SignalType = "BLE" | "Wi-Fi";

export interface Detection {
  id: string;
  ts: number;
  nodeId: NodeId;
  signalType: SignalType;
  tempId: string; // anonymized identifier
  rssi: number;
  distance: number; // metres, estimated
  persistence: number; // 0..1 (how consistently seen)
  status: "tracking" | "intermittent" | "lost";
  sourceMode?: "simulation" | "live" | undefined;
  dataQuality?: "valid" | "degraded" | "stale" | "invalid" | undefined;
  usedInEstimate?: boolean | undefined;
  rejectionReason?: string | undefined;
  measurements?:
    | {
        sound_db?: number | undefined;
        vibration_g?: number | undefined;
        thermal_c?: number | undefined;
      }
    | undefined;
  incidentId?: string | undefined;
}

export interface EvidenceBreakdown {
  wirelessPersistence: number;
  rssiStrength: number;
  sound: number;
  vibration: number;
  thermal: number;
}

export type Priority = "HIGH" | "MEDIUM" | "LOW";

export interface SearchZone {
  id: string;
  ts: number;
  lat: number;
  lon: number;
  radius: number; // confidence radius, metres
  score: number; // 0..100 search priority
  priority: Priority;
  evidence: EvidenceBreakdown;
  contributingNodes: NodeId[];
  note: string;
  confidence?: number | undefined;
  residual?: number | undefined;
  incidentId?: string | undefined;
  geometryScore?: number | undefined;
  inputObservationCount?: number | undefined;
  usableObservationCount?: number | undefined;
  rejectedObservationCount?: number | undefined;
  sourceMode?: "simulation" | "live" | undefined;
  estimatorVersion?: string | undefined;
  warnings?: string[] | undefined;
  hypothetical_search_priority?: boolean | undefined;
}

export type AlertKind = "zone" | "anomaly" | "node" | "operation";
export type Severity = "critical" | "warning" | "info";

export interface AlertItem {
  id: string;
  ts: number;
  kind: AlertKind;
  severity: Severity;
  title: string;
  reason: string;
  target: string;
  acknowledged: boolean;
  incidentId?: string;
  eventId?: string;
}

export type LogLevel = "info" | "warn" | "critical";

export interface LogEvent {
  id: string;
  ts: number;
  level: LogLevel;
  source: string;
  message: string;
  incidentId?: string;
}

export type AppEventType =
  | "incident_created"
  | "incident_updated"
  | "simulation_started"
  | "simulation_paused"
  | "simulation_stopped"
  | "simulation_reset"
  | "simulation_baseline_saved"
  | "scenario_switched"
  | "mode_switched"
  | "node_status_changed"
  | "gateway_connected"
  | "gateway_disconnected"
  | "gateway_status_changed"
  | "observation_rejected"
  | "estimation_run_completed"
  | "zone_generated"
  | "operation_created"
  | "operation_status_changed"
  | "casualty_registered"
  | "casualty_rescued"
  | "casualty_status_changed"
  | "calibration_updated"
  | "report_exported"
  | "settings_changed";

export interface AppEvent {
  id: string;
  ts: number;
  type: AppEventType;
  severity: "info" | "warning" | "critical";
  source: string;
  message: string;
  incidentId?: string | undefined;
  nodeId?: string | undefined;
  zoneId?: string | undefined;
  operationId?: string | undefined;
  details?: Record<string, unknown> | undefined;
}

export interface RejectedObservationInfo {
  nodeId: NodeId;
  reason: string;
  rssi?: number | undefined;
  age?: number | undefined;
}

export interface EstimationPipelineReport {
  timestamp: number;
  sourceMode: "simulation" | "live";
  estimatorVersion: string;
  totalInputObservations: number;
  usableObservationCount: number;
  rejectedObservations: RejectedObservationInfo[];
  contributingNodes: NodeId[];
  eligibilityStatus:
    | "eligible"
    | "no_observations"
    | "observations_invalid"
    | "insufficient_evidence"
    | "localization_unavailable"
    | "active_zone"
    | "device_disconnected"
    | "data_source_unavailable";
  positionEstimateProduced: boolean;
  result: LocalizationResult | null;
  searchZone?: SearchZone | null | undefined;
  geometryScore?: number | undefined;
  gdop?: number | undefined;
  warnings: string[];
  limitations: string[];
}

export interface LocalizationResult {
  lat: number;
  lon: number;
  radius: number;
  residual: number;
  nodes: NodeId[];
  confidence: number;
}

export interface SimulationRunSnapshot {
  id: string;
  timestamp: number;
  scenario: string;
  seed: number;
  estimatorVersion: string;
  noise: number;
  obstruction: number;
  packetLoss: number;
  activeNodes: NodeId[];
  zoneResult?:
    | {
        lat: number;
        lon: number;
        radius: number;
        confidence: number;
        residual: number;
        score?: number | undefined;
      }
    | null
    | undefined;
  eligibilityStatus?: string | undefined;
  activeNodeIds?: NodeId[] | undefined;
  zoneLat?: number | null | undefined;
  zoneLon?: number | null | undefined;
  radius?: number | null | undefined;
  confidence?: number | null | undefined;
  residual?: number | null | undefined;
  geometryScore?: number | null | undefined;
}

export interface CalibrationSettings {
  refRssi: number; // RSSI at 1 m (dBm)
  pathLossExponent: number;
  minRadius: number;
  maxRadius: number;
}

export interface CalibrationSample {
  id: string;
  distance: number; // reference distance in meters (d > 0)
  rssi: number; // measured RSSI in dBm
  source: "live" | "manual" | "simulation";
  timestamp: number;
  notes?: string;
}

export interface CalibrationProfile {
  id: string;
  name: string;
  refRssi: number;
  pathLossExponent: number;
  rmse: number;
  r2: number;
  sampleCount: number;
  distinctDistances: number;
  createdAt: number;
  environment: string;
  frequencyMhz?: number;
  txPowerDbm?: number;
  antennaType?: string;
  warnings: string[];
  isActive?: boolean;
}

/** Telemetry packet shape expected from ESP32 + LoRa gateway (live mode). */
export interface TelemetryPacket {
  nodeId: NodeId;
  latitude: number;
  longitude: number;
  sound: number;
  vibration: number;
  temperature: number;
  bleDetected: number;
  wifiDetected: number;
  rssi: number;
  battery: number;
  timestamp: number;
  loraRssi: number;
  loraSnr: number;
  seq?: number;
  gatewayId?: string;
  gpsFix?: "3d" | "2d" | "none";
  hdop?: number;
}

export type RescueOperationStatus =
  "Reported" | "Under Investigation" | "Rescue In Progress" | "Resolved";

export interface RescueOperationHistory {
  id: string;
  ts: number;
  fromStatus?: RescueOperationStatus | undefined;
  toStatus: RescueOperationStatus;
  note: string;
  operator: string;
}

export interface RescueOperation {
  id: string;
  incidentId: string;
  zoneId?: string | undefined;
  title: string;
  reportedAt: number;
  confirmedAt: number | null;
  rescueStartedAt: number | null;
  rescueCompletedAt: number | null;
  confirmedPeople: number;
  rescuedCount: number;
  awaitingRescue: number;
  status: RescueOperationStatus;
  evidenceSource: string;
  lastUpdated: number;
  notes: string;
  sector: string;
  history: RescueOperationHistory[];
}

export interface ConfirmedSurvivorRecord {
  id: string;
  incidentId: string;
  operationId?: string | undefined;
  zoneId?: string | undefined;
  nameOrIdentifier: string;
  status: "awaiting_rescue" | "rescued";
  confirmedAt: number;
  rescuedAt: number | null;
  confirmationSource:
    | "Vocal Confirmation"
    | "Canine SAR Cross-Check"
    | "Thermal Camera Inspection"
    | "Physical Eyewitness"
    | "Acoustic Tapping Corroboration";
  locationDescription: string;
  medicalUrgency: "low" | "moderate" | "urgent" | "critical";
  notes: string;
}

export type DataQuality = "valid" | "degraded" | "quarantined";

export interface EnhancedTelemetryPacket {
  deviceId: NodeId;
  gatewayId: string;
  timestamp: number;
  seq: number;
  gps: {
    lat: number;
    lon: number;
    alt?: number | undefined;
    hdop?: number | undefined;
    fixStatus: "3d" | "2d" | "none";
  } | null;
  rssi: number;
  measurements: {
    sound_db: number;
    vibration_g: number;
    thermal_c: number;
  };
  battery: number;
  source: "live" | "sim";
  dataQuality: DataQuality;
}
