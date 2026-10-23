/** TRACE V7 Operational REST API Ingress Boundary & Contract Specifications */
export const API_CONTRACT = [
  [
    "POST",
    "/api/v1/detections",
    {
      signalId: "ANON-SESSION-01",
      technology: "BLE",
      nodeId: "N01",
      rssi: -86,
      timestamp: "2026-10-12T13:12:00Z",
    },
  ],
  [
    "POST",
    "/api/v1/nodes/heartbeat",
    {
      nodeId: "N01",
      type: "sniffer",
      x: -120,
      y: 90,
      battery: 88,
      firmware: "trace-1.0",
      packetsReceived: 126,
      packetsLost: 2,
      timestamp: "2026-10-12T13:12:00Z",
    },
  ],
  [
    "POST",
    "/api/v1/gateway/heartbeat",
    { gatewayId: "N04", lora: true, internet: true, gps: true, timestamp: "2026-10-12T13:12:00Z" },
  ],
  [
    "POST",
    "/api/v1/telemetry/packet",
    {
      deviceId: "N01",
      gatewayId: "GW-N04",
      timestamp: 1791810720000,
      seq: 1042,
      gps: {
        lat: 19.89125,
        lon: 74.47982,
        alt: 512.4,
        hdop: 1.1,
        fixStatus: "3d",
      },
      rssi: -78,
      measurements: {
        sound_db: 54.2,
        vibration_g: 0.082,
        thermal_c: 29.4,
      },
      battery: 89,
      source: "live",
      dataQuality: "valid",
    },
  ],
  [
    "POST",
    "/api/v1/operations",
    {
      incidentId: "INC-2026-1012-KPG",
      title: "Sector Delta Void 1 SAR",
      sector: "Sector Delta · Void 1",
      status: "Reported",
      confirmedPeople: 1,
      evidenceSource: "Acoustic Tapping + BLE Crowd Beacons",
      notes: "Canine corroboration active",
    },
  ],
  [
    "POST",
    "/api/v1/survivors",
    {
      incidentId: "INC-2026-1012-KPG",
      operationId: "OP-001",
      nameOrIdentifier: "Subject Alpha",
      status: "awaiting_rescue",
      confirmationSource: "Canine SAR Cross-Check",
      locationDescription: "Basement void under beam",
      medicalUrgency: "urgent",
    },
  ],
  ["GET", "/api/v1/nodes", { nodes: [] }],
  ["GET", "/api/v1/signals", { signals: [] }],
  ["GET", "/api/v1/incidents", { incidents: [] }],
  ["GET", "/api/v1/operations", { operations: [] }],
  ["GET", "/api/v1/survivors", { survivors: [] }],
] as const;

export function createTraceApi(baseUrl: string) {
  async function read(path: string) {
    if (!baseUrl.trim()) throw new Error("No hardware API configured");
    const base = new URL(baseUrl);
    if (base.protocol !== "https:" && base.hostname !== "localhost")
      throw new Error("Use an HTTPS API address");
    const response = await fetch(new URL(path, base), {
      signal: AbortSignal.timeout(8000),
      headers: { Accept: "application/json" },
    });
    if (!response.ok) throw new Error(`API returned ${response.status}`);
    if (!response.headers.get("content-type")?.includes("application/json"))
      throw new Error("API did not return JSON telemetry");
    return response.json() as Promise<unknown>;
  }
  return { read };
}
