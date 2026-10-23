import { getDb } from "../db/database.ts";
import {
  UserRepository,
  SessionRepository,
  IncidentRepository,
  NodeRepository,
  GatewayRepository,
  TelemetryRepository,
  ObservationRepository,
  LocalizationRepository,
  SearchZoneRepository,
  AlertRepository,
  EventRepository,
  AnalyticsRepository,
  CalibrationRepository,
} from "../db/repositories.ts";
import { AuthService } from "../auth/auth-service.ts";
import { eventBus, type RealtimeEvent } from "../realtime/event-bus.ts";
import { OPENAPI_SPEC } from "./openapi.ts";
import {
  runEstimationPipeline,
  fitLogDistanceModel,
  type LocalizationInput,
  type CalibrationSample,
} from "../../lib/kavach/engine.ts";
import { DEFAULT_CALIBRATION, validateEnhancedTelemetry } from "../../lib/kavach/state.ts";
import type { CalibrationSettings, EnhancedTelemetryPacket } from "../../lib/kavach/types.ts";

const serverStartTime = Date.now();

const CORS_HEADERS: Record<string, string> = {
  "content-type": "application/json; charset=utf-8",
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  "access-control-allow-headers":
    "Content-Type, Authorization, X-Trace-Gateway-Secret, X-Trace-Gateway-Id",
};

export function jsonResponse(
  data: unknown,
  status = 200,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { ...CORS_HEADERS, ...extraHeaders },
  });
}

export function handleCorsPreflight(): Response {
  return new Response(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}

export async function handleApiRouter(request: Request, url: URL): Promise<Response> {
  const method = request.method.toUpperCase();
  const path = url.pathname;

  if (method === "OPTIONS") {
    return handleCorsPreflight();
  }

  // 1. Documentation & Specs
  if (path === "/api/docs/openapi.json" && method === "GET") {
    return jsonResponse(OPENAPI_SPEC);
  }

  // 2. Health & Readiness
  if ((path === "/api/health" || path === "/api/v1/health") && method === "GET") {
    const now = Date.now();
    return jsonResponse({
      status: "healthy",
      service: "TRACE Operational Backend",
      version: "8.0.0",
      estimatorVersion: "TRACE-EST-V6.1-GDOP",
      uptimeSeconds: Math.round((now - serverStartTime) / 1000),
      timestamp: now,
      environment: "production",
      database: "sqlite_embedded",
    });
  }

  if (path === "/api/ready" && method === "GET") {
    try {
      const db = getDb();
      const test = db.prepare("SELECT 1 as ok").get() as { ok: number };
      if (test && test.ok === 1) {
        return jsonResponse({ status: "ready", database: "connected" });
      }
      return jsonResponse({ status: "unready", error: "Database returned invalid state" }, 503);
    } catch (err) {
      return jsonResponse(
        { status: "unready", error: "Database unreachable", details: String(err) },
        503,
      );
    }
  }

  // 3. Realtime SSE Stream (/api/events/stream)
  if (path === "/api/events/stream" && method === "GET") {
    const stream = new ReadableStream({
      start(controller) {
        // Send initial connect frame
        const initData = `event: connected\ndata: ${JSON.stringify({ timestamp: Date.now() })}\n\n`;
        controller.enqueue(new TextEncoder().encode(initData));

        const listener = (event: RealtimeEvent) => {
          try {
            const payload = `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
            controller.enqueue(new TextEncoder().encode(payload));
          } catch {
            // client disconnected
          }
        };

        eventBus.on("trace_event", listener);

        // Keep-alive heartbeat every 20 seconds
        const heartbeat = setInterval(() => {
          try {
            controller.enqueue(new TextEncoder().encode(": ping\n\n"));
          } catch {
            clearInterval(heartbeat);
          }
        }, 20000);

        request.signal?.addEventListener("abort", () => {
          eventBus.off("trace_event", listener);
          clearInterval(heartbeat);
          try {
            controller.close();
          } catch {
            // ignore
          }
        });
      },
    });

    return new Response(stream, {
      status: 200,
      headers: {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache",
        connection: "keep-alive",
        "access-control-allow-origin": "*",
      },
    });
  }

  // 4. Authentication Endpoints
  if (path === "/api/auth/login" && method === "POST") {
    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return jsonResponse({ error: "Invalid JSON body" }, 400);
    }

    const username = typeof body["username"] === "string" ? body["username"].trim() : "";
    const password = typeof body["password"] === "string" ? body["password"] : "";

    if (!username || !password) {
      return jsonResponse({ error: "Username and password are required" }, 400);
    }

    const ip = request.headers.get("x-forwarded-for") || "127.0.0.1";
    const userAgent = request.headers.get("user-agent") || "Unknown";
    const result = AuthService.login(username, password, ip, userAgent);

    if (!result.success || !result.token) {
      return jsonResponse(
        { error: result.error || "Authentication failed" },
        result.statusCode || 401,
      );
    }

    // Set HttpOnly cookie
    const cookie = `trace_session=${result.token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400`;
    return jsonResponse(
      {
        message: "Login successful",
        token: result.token,
        user: result.user,
      },
      200,
      { "set-cookie": cookie },
    );
  }

  if (path === "/api/auth/logout" && method === "POST") {
    const auth = AuthService.authenticateRequest(request);
    if (auth.token) {
      AuthService.logout(auth.token);
    }
    const clearCookie = `trace_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
    return jsonResponse({ message: "Logout successful" }, 200, { "set-cookie": clearCookie });
  }

  if (path === "/api/auth/me" && method === "GET") {
    const auth = AuthService.authenticateRequest(request);
    if (!auth.user) {
      return jsonResponse({ error: "Unauthorized", message: "No active session" }, 401);
    }
    return jsonResponse({ user: auth.user });
  }

  // 5. Incident Management
  if (path === "/api/incidents") {
    if (method === "GET") {
      const statusParam = url.searchParams.get("status") || undefined;
      const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") || "50", 10)));
      const offset = Math.max(0, parseInt(url.searchParams.get("offset") || "0", 10));

      const result = IncidentRepository.list(limit, offset, statusParam);
      return jsonResponse(result);
    }

    if (method === "POST") {
      const auth = AuthService.authenticateRequest(request);
      if (!auth.user || !AuthService.hasPermission(auth.user, "incidents:create")) {
        return jsonResponse(
          { error: "Forbidden", message: "Requires Incident Commander or Administrator role" },
          403,
        );
      }

      let body: Record<string, unknown>;
      try {
        body = (await request.json()) as Record<string, unknown>;
      } catch {
        return jsonResponse({ error: "Invalid JSON body" }, 400);
      }

      const name = typeof body["name"] === "string" ? body["name"].trim() : "";
      const lat = typeof body["lat"] === "number" ? body["lat"] : NaN;
      const lon = typeof body["lon"] === "number" ? body["lon"] : NaN;

      if (!name || isNaN(lat) || isNaN(lon)) {
        return jsonResponse({ error: "Name, lat, and lon are required numeric coordinates" }, 400);
      }

      const id = `INC-${Date.now().toString(36).toUpperCase()}`;
      const incident = IncidentRepository.create({
        id,
        name,
        status: (body["status"] as "active") || "active",
        priority: (body["priority"] as "high") || "high",
        description: typeof body["description"] === "string" ? body["description"] : null,
        lat,
        lon,
        radius_m: typeof body["radius_m"] === "number" ? body["radius_m"] : 500.0,
        commander_id: auth.user.id,
      });

      EventRepository.logAppEvent({
        incident_id: id,
        event_type: "incident_created",
        severity: "info",
        title: `Incident ${incident.name} Created`,
        details: incident.description,
        actor_id: auth.user.id,
      });

      eventBus.publish({
        type: "incident:updated",
        incidentId: id,
        data: incident,
      });

      return jsonResponse(incident, 201);
    }
  }

  // Single Incident: /api/incidents/:id
  const incidentMatch = path.match(/^\/api\/incidents\/([a-zA-Z0-9_-]+)$/);
  if (incidentMatch && incidentMatch[1]) {
    const id = incidentMatch[1];
    if (method === "GET") {
      const incident = IncidentRepository.findById(id);
      if (!incident) return jsonResponse({ error: "Incident not found" }, 404);
      return jsonResponse(incident);
    }

    if (method === "PATCH") {
      const auth = AuthService.authenticateRequest(request);
      if (!auth.user || !AuthService.hasPermission(auth.user, "incidents:update")) {
        return jsonResponse({ error: "Forbidden", message: "Insufficient permissions" }, 403);
      }

      let body: Record<string, unknown>;
      try {
        body = (await request.json()) as Record<string, unknown>;
      } catch {
        return jsonResponse({ error: "Invalid JSON body" }, 400);
      }

      const updated = IncidentRepository.update(
        id,
        body as Partial<Omit<import("../db/repositories.ts").IncidentRecord, "id" | "created_at">>,
      );
      if (!updated) return jsonResponse({ error: "Incident not found" }, 404);

      eventBus.publish({
        type: "incident:updated",
        incidentId: id,
        data: updated,
      });

      return jsonResponse(updated);
    }

    if (method === "DELETE") {
      const auth = AuthService.authenticateRequest(request);
      if (!auth.user || !AuthService.hasPermission(auth.user, "incidents:close")) {
        return jsonResponse(
          { error: "Forbidden", message: "Requires Commander or Admin role" },
          403,
        );
      }
      const updated = IncidentRepository.update(id, { status: "archived" });
      if (!updated) return jsonResponse({ error: "Incident not found" }, 404);
      return jsonResponse({ message: `Incident ${id} successfully archived`, incident: updated });
    }
  }

  // 6. Sensor Nodes (/api/nodes)
  if (path === "/api/nodes" || path === "/api/v1/nodes") {
    if (method === "GET") {
      const nodes = NodeRepository.list();
      return jsonResponse({ count: nodes.length, nodes });
    }

    if (method === "POST") {
      let body: Record<string, unknown>;
      try {
        body = (await request.json()) as Record<string, unknown>;
      } catch {
        return jsonResponse({ error: "Invalid JSON body" }, 400);
      }

      const nodeId = typeof body["nodeId"] === "string" ? body["nodeId"].trim() : "";
      if (!nodeId) return jsonResponse({ error: "nodeId is required" }, 400);

      const lat = typeof body["lat"] === "number" ? body["lat"] : 19.8762;
      const lon = typeof body["lon"] === "number" ? body["lon"] : 74.4785;

      const node = NodeRepository.upsert({
        id: `NODE-${nodeId}`,
        node_id: nodeId,
        gateway_id: typeof body["gatewayId"] === "string" ? (body["gatewayId"] as string) : null,
        name: typeof body["name"] === "string" ? (body["name"] as string) : `Station ${nodeId}`,
        type: (body["type"] as "sniffer") || "sniffer",
        lat,
        lon,
        alt: typeof body["alt"] === "number" ? (body["alt"] as number) : 0,
        battery: typeof body["battery"] === "number" ? (body["battery"] as number) : 100,
        status: "online",
        last_seen: Date.now(),
      });

      eventBus.publish({
        type: "node:status_changed",
        data: node,
      });

      return jsonResponse(node, 201);
    }
  }

  // 7. Gateways (/api/gateways)
  if (path === "/api/gateways") {
    if (method === "GET") {
      const gateways = GatewayRepository.list();
      return jsonResponse({ count: gateways.length, gateways });
    }

    if (method === "POST") {
      let body: Record<string, unknown>;
      try {
        body = (await request.json()) as Record<string, unknown>;
      } catch {
        return jsonResponse({ error: "Invalid JSON body" }, 400);
      }

      const gatewayId = typeof body["gatewayId"] === "string" ? body["gatewayId"].trim() : "";
      if (!gatewayId) return jsonResponse({ error: "gatewayId is required" }, 400);

      const gw = GatewayRepository.upsert({
        id: `GW-${gatewayId}`,
        gateway_id: gatewayId,
        name: typeof body["name"] === "string" ? (body["name"] as string) : `Gateway ${gatewayId}`,
        type: typeof body["type"] === "string" ? (body["type"] as string) : "lora_serial",
        lat: typeof body["lat"] === "number" ? (body["lat"] as number) : null,
        lon: typeof body["lon"] === "number" ? (body["lon"] as number) : null,
        status: "online",
        last_seen: Date.now(),
      });

      eventBus.publish({
        type: "gateway:status_changed",
        data: gw,
      });

      return jsonResponse(gw, 201);
    }
  }

  // 8. Telemetry Ingest (/api/telemetry/ingest or /api/v1/telemetry/packet)
  if (
    (path === "/api/telemetry/ingest" || path === "/api/v1/telemetry/packet") &&
    method === "POST"
  ) {
    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return jsonResponse({ error: "Malformed JSON payload" }, 400);
    }

    const deviceId =
      typeof body["deviceId"] === "string"
        ? (body["deviceId"] as string).trim()
        : typeof body["nodeId"] === "string"
          ? (body["nodeId"] as string).trim()
          : "";

    if (!deviceId) {
      return jsonResponse({ error: "Missing required field 'nodeId' (or 'deviceId')" }, 400);
    }

    // Extract & validate coordinates
    let lat: number | undefined;
    let lon: number | undefined;
    if (typeof body["lat"] === "number") lat = body["lat"];
    else if (typeof body["latitude"] === "number") lat = body["latitude"];
    else if (typeof body["gps"] === "object" && body["gps"] !== null) {
      const g = body["gps"] as Record<string, unknown>;
      if (typeof g["lat"] === "number") lat = g["lat"];
    }

    if (typeof body["lon"] === "number") lon = body["lon"];
    else if (typeof body["longitude"] === "number") lon = body["longitude"];
    else if (typeof body["gps"] === "object" && body["gps"] !== null) {
      const g = body["gps"] as Record<string, unknown>;
      if (typeof g["lon"] === "number") lon = g["lon"];
    }

    // Validation checks
    if (lat !== undefined && (isNaN(lat) || lat < -90 || lat > 90)) {
      return jsonResponse({ error: `Latitude ${lat} out of bounds [-90, 90]` }, 400);
    }
    if (lon !== undefined && (isNaN(lon) || lon < -180 || lon > 180)) {
      return jsonResponse({ error: `Longitude ${lon} out of bounds [-180, 180]` }, 400);
    }

    const rssi = typeof body["rssi"] === "number" ? body["rssi"] : null;
    if (rssi !== null && (isNaN(rssi) || rssi < -150 || rssi > 20)) {
      return jsonResponse({ error: `RSSI ${rssi} dBm out of physical bounds [-150, 20]` }, 400);
    }

    const timestamp = typeof body["timestamp"] === "number" ? body["timestamp"] : Date.now();
    if (timestamp > Date.now() + 60000) {
      return jsonResponse({ error: "Timestamp cannot be in the future (>60s)" }, 400);
    }

    const messageId =
      typeof body["messageId"] === "string"
        ? (body["messageId"] as string)
        : `MSG-${deviceId}-${body["seq"] || Date.now()}`;

    // Duplicate message check
    const existingMsg = TelemetryRepository.findByMessageId(messageId);
    if (existingMsg) {
      return jsonResponse(
        { status: "duplicate", message: "Message ID already processed", messageId },
        200,
      );
    }

    const seq = typeof body["seq"] === "number" ? body["seq"] : 1;
    const source = body["source"] === "sim" ? "sim" : "live";

    // Resolve and update gateway relation safely against registered gateways
    const rawGwId =
      typeof body["gatewayId"] === "string" ? (body["gatewayId"] as string).trim() : null;
    let resolvedGwId: string | null = null;
    if (rawGwId) {
      resolvedGwId = rawGwId;
      const existingGw = GatewayRepository.findByGatewayId(rawGwId);
      if (existingGw) {
        GatewayRepository.upsert({
          ...existingGw,
          status: "online",
          last_seen: Date.now(),
        });
      } else {
        GatewayRepository.upsert({
          id: `GW-${rawGwId}`,
          gateway_id: rawGwId,
          name: `Gateway ${rawGwId}`,
          type: "lora_serial",
          lat: lat ?? 19.8762,
          lon: lon ?? 74.4785,
          status: "online",
          last_seen: Date.now(),
        });
      }
      eventBus.publish({
        type: "gateway:status_changed",
        data: { gateway_id: rawGwId, status: "online", last_seen: Date.now() },
      });
    }

    // Record in database
    const tlm = TelemetryRepository.record({
      message_id: messageId,
      node_id: deviceId,
      gateway_id: resolvedGwId,
      seq,
      protocol_version:
        typeof body["protocolVersion"] === "string" ? (body["protocolVersion"] as string) : "v2.0",
      timestamp,
      source,
      rssi,
      battery: typeof body["battery"] === "number" ? body["battery"] : null,
      sound_db: typeof body["sound"] === "number" ? body["sound"] : null,
      vibration_g: typeof body["vibration"] === "number" ? body["vibration"] : null,
      thermal_c: typeof body["thermal"] === "number" ? body["thermal"] : null,
      lat: lat ?? null,
      lon: lon ?? null,
      raw_payload: JSON.stringify(body),
    });

    // Update node health in registry while preserving existing coordinates if not provided
    const existingNode = NodeRepository.findByNodeId(deviceId);
    const finalLat = lat !== undefined ? lat : (existingNode?.lat ?? 19.8762);
    const finalLon = lon !== undefined ? lon : (existingNode?.lon ?? 74.4785);

    const updatedNode = NodeRepository.upsert({
      id: existingNode?.id || `NODE-${deviceId}`,
      node_id: deviceId,
      gateway_id: resolvedGwId,
      name: existingNode?.name || `Station ${deviceId}`,
      type: existingNode?.type || "sniffer",
      lat: finalLat,
      lon: finalLon,
      alt: existingNode?.alt ?? 0,
      battery: tlm.battery ?? existingNode?.battery ?? 100,
      status: "online",
      last_seen: Date.now(),
    });

    // Publish realtime events
    eventBus.publish({
      type: "node:status_changed",
      data: updatedNode,
    });

    eventBus.publish({
      type: "telemetry:accepted",
      data: tlm,
    });

    return jsonResponse(
      { status: "accepted", messageId, id: tlm.id, timestamp: tlm.timestamp },
      201,
    );
  }

  // 9. Telemetry Query (/api/telemetry or /api/v1/telemetry/packet)
  if ((path === "/api/telemetry" || path === "/api/v1/telemetry/packet") && method === "GET") {
    const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get("limit") || "50", 10)));
    const offset = Math.max(0, parseInt(url.searchParams.get("offset") || "0", 10));
    const nodeId = url.searchParams.get("nodeId") || url.searchParams.get("deviceId") || undefined;
    const source = url.searchParams.get("source") || undefined;

    const result = TelemetryRepository.list(limit, offset, nodeId, source);
    return jsonResponse(result);
  }

  // 10. Localization Execution (/api/localization/run or /api/v1/estimation/pipeline)
  if (
    (path === "/api/localization/run" || path === "/api/v1/estimation/pipeline") &&
    method === "POST"
  ) {
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
    const incidentId = typeof body["incidentId"] === "string" ? body["incidentId"] : null;

    const report = runEstimationPipeline(observations, cal, sourceMode);

    // Save run in DB
    const run = LocalizationRepository.recordRun({
      incident_id: incidentId,
      algorithm_version: report.estimatorVersion,
      run_at: report.timestamp,
      usable_nodes_count: report.usableObservationCount,
      gdop: report.gdop ?? null,
      lat_est: report.result?.lat ?? null,
      lon_est: report.result?.lon ?? null,
      uncertainty_radius_m: report.result?.radius ?? null,
      confidence: report.result?.confidence ?? null,
      status:
        report.eligibilityStatus === "active_zone" || report.positionEstimateProduced
          ? "success"
          : "insufficient_evidence",
      warnings: report.warnings.join("; "),
    });

    // If search zone generated, persist search zone
    if (report.searchZone) {
      SearchZoneRepository.create({
        incident_id: incidentId,
        localization_run_id: run.id,
        center_lat: report.searchZone.lat,
        center_lon: report.searchZone.lon,
        radius_m: report.searchZone.radius,
        priority: (report.searchZone.priority?.toLowerCase() as "high") || "high",
        status: "active",
        shape_geojson: JSON.stringify(report.searchZone),
      });

      eventBus.publish({
        type: "search_zone:updated",
        incidentId,
        data: report.searchZone,
      });
    }

    eventBus.publish({
      type: "localization:completed",
      incidentId,
      data: { report, runId: run.id },
    });

    return jsonResponse({ runId: run.id, ...report });
  }

  // 11. Search Zones (/api/search-zones)
  if (path === "/api/search-zones" && method === "GET") {
    const incidentId = url.searchParams.get("incidentId") || undefined;
    const zones = SearchZoneRepository.list(50, incidentId);
    return jsonResponse({ count: zones.length, searchZones: zones });
  }

  // 12. Alerts (/api/alerts)
  if (path === "/api/alerts" && method === "GET") {
    const status = url.searchParams.get("status") || undefined;
    const alerts = AlertRepository.list(50, status);
    return jsonResponse({ count: alerts.length, alerts });
  }

  const alertMatch = path.match(/^\/api\/alerts\/([a-zA-Z0-9_-]+)$/);
  if (alertMatch && method === "PATCH") {
    const id = alertMatch[1] as string;
    const auth = AuthService.authenticateRequest(request);
    const userId = auth.user ? auth.user.id : "ANONYMOUS";
    const updated = AlertRepository.acknowledge(id, userId);
    if (!updated) return jsonResponse({ error: "Alert not found" }, 404);

    eventBus.publish({
      type: "alert:acknowledged",
      data: updated,
    });

    return jsonResponse(updated);
  }

  // 13. Event History (/api/events)
  if (path === "/api/events" && method === "GET") {
    const incidentId = url.searchParams.get("incidentId") || undefined;
    const events = EventRepository.listAppEvents(100, incidentId);
    return jsonResponse({ count: events.length, events });
  }

  // 14. RF Calibration Profiles & Regression (/api/calibration/*)
  if (path === "/api/calibration/profiles" && method === "GET") {
    const profiles = CalibrationRepository.listProfiles();
    return jsonResponse({ count: profiles.length, profiles });
  }

  if (path === "/api/calibration/profiles" && method === "POST") {
    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return jsonResponse({ error: "Malformed JSON payload" }, 400);
    }

    const name =
      typeof body["name"] === "string" ? body["name"].trim() : "Custom Calibration Profile";
    const refRssi = typeof body["refRssi"] === "number" ? body["refRssi"] : -48.0;
    const pathLossExponent =
      typeof body["pathLossExponent"] === "number" ? body["pathLossExponent"] : 2.7;
    const rmse = typeof body["rmse"] === "number" ? body["rmse"] : 0.0;
    const r2 = typeof body["r2"] === "number" ? body["r2"] : 0.0;
    const sampleCount = typeof body["sampleCount"] === "number" ? body["sampleCount"] : 0;
    const distinctDistances =
      typeof body["distinctDistances"] === "number" ? body["distinctDistances"] : 0;
    const environment =
      typeof body["environment"] === "string" ? body["environment"] : "Rubble Debris";
    const frequencyMhz = typeof body["frequencyMhz"] === "number" ? body["frequencyMhz"] : 868.1;
    const txPowerDbm = typeof body["txPowerDbm"] === "number" ? body["txPowerDbm"] : 14.0;
    const antennaType =
      typeof body["antennaType"] === "string" ? body["antennaType"] : "Omnidirectional Dipole";
    const warningsJson =
      typeof body["warningsJson"] === "string"
        ? body["warningsJson"]
        : JSON.stringify(body["warnings"] || []);
    const isActive = body["isActive"] === true ? 1 : 0;

    const samples = Array.isArray(body["samples"])
      ? (body["samples"] as {
          distance: number;
          rssi: number;
          source: "live" | "manual" | "simulation";
          timestamp: number;
          notes?: string;
        }[])
      : [];

    const profile = CalibrationRepository.createProfile(
      {
        name,
        ref_rssi: refRssi,
        path_loss_exponent: pathLossExponent,
        rmse,
        r2,
        sample_count: sampleCount,
        distinct_distances: distinctDistances,
        environment,
        frequency_mhz: frequencyMhz,
        tx_power_dbm: txPowerDbm,
        antenna_type: antennaType,
        warnings_json: warningsJson,
        is_active: isActive,
      },
      samples,
    );

    return jsonResponse(profile, 201);
  }

  if (path === "/api/calibration/fit" && method === "POST") {
    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return jsonResponse({ error: "Malformed JSON payload" }, 400);
    }

    const samples = Array.isArray(body["samples"]) ? (body["samples"] as CalibrationSample[]) : [];
    const d0 = typeof body["d0"] === "number" && body["d0"] > 0 ? body["d0"] : 1.0;
    const fit = fitLogDistanceModel(samples, d0);
    return jsonResponse(fit);
  }

  const calActivateMatch = path.match(/^\/api\/calibration\/activate\/([a-zA-Z0-9_-]+)$/);
  if (calActivateMatch && method === "POST") {
    const id = calActivateMatch[1] as string;
    const success = CalibrationRepository.activateProfile(id);
    if (!success) return jsonResponse({ error: "Profile not found" }, 404);
    return jsonResponse({ success: true, message: `Profile ${id} activated` });
  }

  // 15. Analytics Endpoints
  if (path === "/api/analytics/overview" && method === "GET") {
    const overview = AnalyticsRepository.getOverview();
    return jsonResponse(overview);
  }

  if (path === "/api/analytics/sensors" && method === "GET") {
    const nodes = NodeRepository.list();
    const batteryDist = { high: 0, medium: 0, low: 0, critical: 0 };
    for (const n of nodes) {
      const b = n.battery ?? 100;
      if (b > 70) batteryDist.high++;
      else if (b > 40) batteryDist.medium++;
      else if (b > 15) batteryDist.low++;
      else batteryDist.critical++;
    }
    return jsonResponse({
      totalSensors: nodes.length,
      batteryDistribution: batteryDist,
      sensors: nodes,
    });
  }

  return jsonResponse(
    {
      error: "Not Found",
      message: `Endpoint ${method} ${path} is not recognized.`,
      documentation: "/api/docs/openapi.json",
    },
    404,
  );
}
