import { runEstimationPipeline, type LocalizationInput } from "../kavach/engine.ts";
import { DEFAULT_CALIBRATION, validateEnhancedTelemetry } from "../kavach/state.ts";
import type { CalibrationSettings, EnhancedTelemetryPacket } from "../kavach/types.ts";

export interface BufferedPacket {
  id: string;
  receivedAt: number;
  payload: EnhancedTelemetryPacket;
}

export interface NodeHealthRecord {
  nodeId: string;
  type: "sniffer" | "gateway";
  lastSeen: number;
  battery?: number | undefined;
  packetsReceived: number;
  packetsLost: number;
  rssi?: number | undefined;
  lat?: number | undefined;
  lon?: number | undefined;
  status: "online" | "degraded" | "offline";
}

// In-memory ring buffer (up to 200 packets) and station health registry
const MAX_PACKETS = 200;
const packetBuffer: BufferedPacket[] = [];
const nodeRegistry = new Map<string, NodeHealthRecord>();
const serverStartTime = Date.now();
let packetCounter = 1000;

const CORS_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, PUT, DELETE, OPTIONS",
  "access-control-allow-headers": "Content-Type, Authorization, X-Trace-Gateway-Id",
};

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: CORS_HEADERS,
  });
}

export function handleCorsPreflight(): Response {
  return new Response(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}

export function normalizeRawTelemetry(payload: unknown): {
  valid: boolean;
  error?: string | undefined;
  packet?: EnhancedTelemetryPacket | undefined;
} {
  if (!payload || typeof payload !== "object") {
    return { valid: false, error: "Request body must be a valid JSON object" };
  }

  const p = payload as Record<string, unknown>;
  const deviceId =
    typeof p["deviceId"] === "string"
      ? (p["deviceId"] as string).trim()
      : typeof p["nodeId"] === "string"
        ? (p["nodeId"] as string).trim()
        : "";

  if (!deviceId) {
    return { valid: false, error: "Missing required field 'deviceId' (or 'nodeId')" };
  }

  // Normalize coordinates into gps object if flat lat/lon provided
  let gpsObj =
    typeof p["gps"] === "object" && p["gps"] !== null
      ? (p["gps"] as Record<string, unknown>)
      : null;
  if (!gpsObj) {
    const rawLat =
      typeof p["latitude"] === "number"
        ? p["latitude"]
        : typeof p["lat"] === "number"
          ? p["lat"]
          : 19.8762;
    const rawLon =
      typeof p["longitude"] === "number"
        ? p["longitude"]
        : typeof p["lon"] === "number"
          ? p["lon"]
          : 74.4785;
    gpsObj = {
      lat: rawLat,
      lon: rawLon,
      alt: 512,
      hdop: typeof p["hdop"] === "number" ? p["hdop"] : 1.2,
      fixStatus: "3d",
    };
  }

  // Normalize measurements object if flat values provided
  let measurementsObj =
    typeof p["measurements"] === "object" && p["measurements"] !== null
      ? (p["measurements"] as Record<string, unknown>)
      : null;

  if (!measurementsObj) {
    measurementsObj = {
      sound_db: typeof p["sound"] === "number" ? p["sound"] : 40.0,
      vibration_g: typeof p["vibration"] === "number" ? p["vibration"] : 0.04,
      thermal_c: typeof p["temperature"] === "number" ? p["temperature"] : 27.5,
    };
  }

  const normalized = {
    deviceId,
    gatewayId: typeof p["gatewayId"] === "string" ? (p["gatewayId"] as string) : "GW-DEFAULT",
    timestamp: typeof p["timestamp"] === "number" ? p["timestamp"] : Date.now(),
    seq: typeof p["seq"] === "number" ? p["seq"] : ++packetCounter,
    rssi: typeof p["rssi"] === "number" ? p["rssi"] : NaN,
    battery: typeof p["battery"] === "number" ? p["battery"] : 100,
    measurements: measurementsObj,
    gps: gpsObj,
    source: (p["source"] === "sim" ? "sim" : "live") as "live" | "sim",
    dataQuality: "valid" as const,
  };

  const validation = validateEnhancedTelemetry(normalized);
  if (!validation.valid || !validation.packet) {
    return { valid: false, error: validation.error ?? "Invalid telemetry packet structure" };
  }

  return { valid: true, packet: validation.packet };
}

export async function handleApiV1Request(request: Request, url: URL): Promise<Response> {
  const method = request.method.toUpperCase();
  const path = url.pathname;

  if (method === "OPTIONS") {
    return handleCorsPreflight();
  }

  // 1. Health check
  if (path === "/api/v1/health" && method === "GET") {
    const now = Date.now();
    return jsonResponse({
      status: "healthy",
      service: "TRACE Operational Backend Ingress",
      version: "7.0.0",
      estimatorVersion: "TRACE-EST-V6.1-GDOP",
      timestamp: now,
      uptimeSeconds: Math.round((now - serverStartTime) / 1000),
      environment: "edge-ssr",
      ingestion: {
        bufferedPackets: packetBuffer.length,
        maxBuffer: MAX_PACKETS,
        registeredNodes: nodeRegistry.size,
      },
      supportedEndpoints: [
        "GET /api/v1/health",
        "POST /api/v1/telemetry/packet",
        "GET /api/v1/telemetry/packet",
        "POST /api/v1/nodes/heartbeat",
        "GET /api/v1/nodes",
        "POST /api/v1/estimation/pipeline",
      ],
    });
  }

  // 2. Ingest telemetry packet
  if (path === "/api/v1/telemetry/packet") {
    if (method === "POST") {
      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return jsonResponse(
          { error: "Invalid JSON", message: "Malformed JSON payload in request body" },
          400,
        );
      }

      const norm = normalizeRawTelemetry(body);
      if (!norm.valid || !norm.packet) {
        return jsonResponse(
          {
            error: "Telemetry Validation Failed",
            message: norm.error ?? "Incoming packet failed RFC-4180 / physical boundary checks",
          },
          400,
        );
      }

      const packet = norm.packet;
      const id = `PKT-${packet.seq || ++packetCounter}`;
      const entry: BufferedPacket = {
        id,
        receivedAt: Date.now(),
        payload: packet,
      };

      // Add to buffer
      packetBuffer.unshift(entry);
      if (packetBuffer.length > MAX_PACKETS) {
        packetBuffer.pop();
      }

      // Update node registry
      const existing = nodeRegistry.get(packet.deviceId);
      nodeRegistry.set(packet.deviceId, {
        nodeId: packet.deviceId,
        type: packet.deviceId.includes("GW") ? "gateway" : "sniffer",
        lastSeen: entry.receivedAt,
        battery: packet.battery,
        packetsReceived: (existing?.packetsReceived ?? 0) + 1,
        packetsLost: existing?.packetsLost ?? 0,
        rssi: packet.rssi,
        lat: packet.gps?.lat,
        lon: packet.gps?.lon,
        status: "online",
      });

      return jsonResponse(
        {
          status: "accepted",
          packetId: id,
          deviceId: packet.deviceId,
          receivedAt: entry.receivedAt,
          rssi: packet.rssi,
          bufferedTotal: packetBuffer.length,
        },
        201,
      );
    }

    if (method === "GET") {
      const limitParam = url.searchParams.get("limit");
      const deviceParam = url.searchParams.get("deviceId");
      const sinceParam = url.searchParams.get("since");

      let filtered = [...packetBuffer];
      if (deviceParam) {
        filtered = filtered.filter((p) => p.payload.deviceId === deviceParam);
      }
      if (sinceParam) {
        const sinceTs = parseInt(sinceParam, 10);
        if (Number.isFinite(sinceTs)) {
          filtered = filtered.filter((p) => p.receivedAt >= sinceTs);
        }
      }

      const limit = Math.min(200, Math.max(1, parseInt(limitParam || "50", 10) || 50));
      const sliced = filtered.slice(0, limit);

      return jsonResponse({
        count: sliced.length,
        totalBuffered: packetBuffer.length,
        packets: sliced,
      });
    }

    return jsonResponse({ error: "Method Not Allowed" }, 405);
  }

  // 3. Node heartbeat
  if (path === "/api/v1/nodes/heartbeat" && method === "POST") {
    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return jsonResponse({ error: "Invalid JSON" }, 400);
    }

    const nodeId = typeof body["nodeId"] === "string" ? (body["nodeId"] as string).trim() : "";
    if (!nodeId) {
      return jsonResponse({ error: "Missing required 'nodeId'" }, 400);
    }

    const existing = nodeRegistry.get(nodeId);
    const recCount =
      typeof body["packetsReceived"] === "number"
        ? (body["packetsReceived"] as number)
        : (existing?.packetsReceived ?? 0) + 1;
    const lostCount =
      typeof body["packetsLost"] === "number"
        ? (body["packetsLost"] as number)
        : (existing?.packetsLost ?? 0);

    nodeRegistry.set(nodeId, {
      nodeId,
      type: typeof body["type"] === "string" && body["type"] === "gateway" ? "gateway" : "sniffer",
      lastSeen: Date.now(),
      battery:
        typeof body["battery"] === "number" ? (body["battery"] as number) : existing?.battery,
      packetsReceived: recCount,
      packetsLost: lostCount,
      status: "online",
    });

    return jsonResponse({
      status: "ok",
      nodeId,
      lastSeen: Date.now(),
    });
  }

  // 4. List nodes
  if (path === "/api/v1/nodes" && method === "GET") {
    const now = Date.now();
    const nodes = Array.from(nodeRegistry.values()).map((n) => ({
      ...n,
      status: (now - n.lastSeen > 60000
        ? "offline"
        : now - n.lastSeen > 20000
          ? "degraded"
          : "online") as NodeHealthRecord["status"],
    }));

    return jsonResponse({
      count: nodes.length,
      nodes,
    });
  }

  // 5. Run transparent estimation pipeline on server
  if (path === "/api/v1/estimation/pipeline" && method === "POST") {
    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return jsonResponse({ error: "Invalid JSON body" }, 400);
    }

    const observations = Array.isArray(body["observations"])
      ? (body["observations"] as LocalizationInput[])
      : [];
    const cal = (body["calibration"] as CalibrationSettings) || DEFAULT_CALIBRATION;
    const sourceMode = body["sourceMode"] === "live" ? "live" : "simulation";

    const report = runEstimationPipeline(observations, cal, sourceMode);
    return jsonResponse(report);
  }

  return jsonResponse(
    {
      error: "Not Found",
      message: `Endpoint ${method} ${path} does not exist in TRACE API v1 contract.`,
      documentation: "/api-docs",
    },
    404,
  );
}
