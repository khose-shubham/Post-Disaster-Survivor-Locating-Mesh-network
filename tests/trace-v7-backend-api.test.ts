import test from "node:test";
import assert from "node:assert/strict";
import { handleApiV1Request, normalizeRawTelemetry } from "../src/lib/server/api-handler.ts";
import { DEFAULT_CALIBRATION } from "../src/lib/kavach/state.ts";

test("V7 API 1: GET /api/v1/health returns genuine engine version, uptime, and endpoint specifications", async () => {
  const url = new URL("http://localhost:8080/api/v1/health");
  const req = new Request(url, { method: "GET" });
  const res = await handleApiV1Request(req, url);

  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "application/json; charset=utf-8");

  const data = (await res.json()) as Record<string, unknown>;
  assert.equal(data.status, "healthy");
  assert.equal(data.version, "7.0.0");
  assert.equal(data.estimatorVersion, "TRACE-EST-V6.1-GDOP");
  assert.ok(Array.isArray(data.supportedEndpoints), "Must list supported endpoints");
  assert.ok((data.supportedEndpoints as string[]).includes("POST /api/v1/telemetry/packet"));
});

test("V7 API 2: POST /api/v1/telemetry/packet validates and accepts RFC-compliant telemetry", async () => {
  const url = new URL("http://localhost:8080/api/v1/telemetry/packet");
  const payload = {
    deviceId: "SNIFF-N01",
    gatewayId: "GW-KPG-01",
    timestamp: Date.now(),
    rssi: -72.5,
    latitude: 19.8765,
    longitude: 74.4789,
    sound: 45.2,
    vibration: 0.04,
    temperature: 28.1,
    battery: 94,
    seq: 1042,
  };

  const req = new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const res = await handleApiV1Request(req, url);
  assert.equal(res.status, 201, "Valid packet must be accepted with HTTP 201 Created");

  const data = (await res.json()) as Record<string, unknown>;
  assert.equal(data.status, "accepted");
  assert.equal(data.deviceId, "SNIFF-N01");
  assert.equal(data.packetId, "PKT-1042");
  assert.ok(data.receivedAt, "Must include server receivedAt timestamp");
});

test("V7 API 3: POST /api/v1/telemetry/packet strictly rejects out-of-bounds RSSI and malformed coordinates", async () => {
  const url = new URL("http://localhost:8080/api/v1/telemetry/packet");

  // Case A: RSSI out of physical bounds (< -150 dBm)
  const badRssi = {
    deviceId: "SNIFF-N02",
    rssi: -160,
  };
  const reqA = new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(badRssi),
  });
  const resA = await handleApiV1Request(reqA, url);
  assert.equal(resA.status, 400, "Out-of-bounds RSSI must return HTTP 400");
  const dataA = (await resA.json()) as Record<string, unknown>;
  assert.equal(dataA.error, "Telemetry Validation Failed");

  // Case B: Invalid latitude (> 90 deg)
  const badLat = {
    deviceId: "SNIFF-N03",
    rssi: -65,
    latitude: 95.0,
  };
  const reqB = new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(badLat),
  });
  const resB = await handleApiV1Request(reqB, url);
  assert.equal(resB.status, 400, "Invalid latitude must return HTTP 400");
});

test("V7 API 4: GET /api/v1/telemetry/packet retrieves buffered packets with deviceId filtering", async () => {
  // Query buffered packets
  const url = new URL("http://localhost:8080/api/v1/telemetry/packet?deviceId=SNIFF-N01");
  const req = new Request(url, { method: "GET" });
  const res = await handleApiV1Request(req, url);

  assert.equal(res.status, 200);
  const data = (await res.json()) as {
    count: number;
    packets: { payload: { deviceId: string } }[];
  };
  assert.ok(data.count >= 1, "Should return at least the packet ingested in Test 2");
  assert.equal(data.packets[0]?.payload.deviceId, "SNIFF-N01");
});

test("V7 API 5: Node heartbeat and station status registry", async () => {
  // 1. Send heartbeat
  const hbUrl = new URL("http://localhost:8080/api/v1/nodes/heartbeat");
  const hbReq = new Request(hbUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      nodeId: "NODE-AUTOTEST-01",
      type: "sniffer",
      battery: 88,
      packetsReceived: 42,
    }),
  });
  const hbRes = await handleApiV1Request(hbReq, hbUrl);
  assert.equal(hbRes.status, 200);

  // 2. Query nodes registry
  const listUrl = new URL("http://localhost:8080/api/v1/nodes");
  const listReq = new Request(listUrl, { method: "GET" });
  const listRes = await handleApiV1Request(listReq, listUrl);
  assert.equal(listRes.status, 200);

  const listData = (await listRes.json()) as { nodes: { nodeId: string; status: string }[] };
  const found = listData.nodes.find((n) => n.nodeId === "NODE-AUTOTEST-01");
  assert.ok(found, "Registered node must appear in /api/v1/nodes");
  assert.equal(found.status, "online");
});

test("V7 API 6: POST /api/v1/estimation/pipeline executes server-side multilateration", async () => {
  const url = new URL("http://localhost:8080/api/v1/estimation/pipeline");
  const observations = [
    { nodeId: "N1", lat: 19.876, lon: 74.478, rssi: -60, age: 2 },
    { nodeId: "N2", lat: 19.876, lon: 74.4795, rssi: -64, age: 2 },
    { nodeId: "N3", lat: 19.8775, lon: 74.478, rssi: -68, age: 2 },
  ];

  const req = new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      observations,
      calibration: DEFAULT_CALIBRATION,
      sourceMode: "live",
    }),
  });

  const res = await handleApiV1Request(req, url);
  assert.equal(res.status, 200);

  const report = (await res.json()) as Record<string, unknown>;
  assert.equal(report.eligibilityStatus, "active_zone");
  assert.equal(report.positionEstimateProduced, true);
  assert.ok(report.searchZone != null, "Must produce search zone candidate");
});

test("V7 Validation Unit: normalizeRawTelemetry bounds and edge cases", () => {
  // Empty payload
  const emptyRes = normalizeRawTelemetry(null);
  assert.equal(emptyRes.valid, false);

  // Valid payload
  const validRes = normalizeRawTelemetry({
    deviceId: "TEST-01",
    rssi: -75,
  });
  assert.equal(validRes.valid, true);
  assert.equal(validRes.packet?.deviceId, "TEST-01");
  assert.equal(validRes.packet?.rssi, -75);
});
