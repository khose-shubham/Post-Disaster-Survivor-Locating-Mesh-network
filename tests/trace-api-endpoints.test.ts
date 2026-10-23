import test from "node:test";
import assert from "node:assert/strict";
import { handleApiRouter } from "../src/server/api/router.ts";
import { resetDatabase, closeDb } from "../src/server/db/database.ts";

function createRequest(path: string, options: RequestInit = {}): { request: Request; url: URL } {
  const url = new URL(`http://localhost:8080${path}`);
  const request = new Request(url.toString(), {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(options.headers || {}),
    },
  });
  return { request, url };
}

test("Complete REST API Endpoints & Authorization Tests", async (t) => {
  process.env["DATABASE_PATH"] = ":memory:";
  resetDatabase();

  let adminToken = "";
  let viewerToken = "";
  let createdIncidentId = "";

  await t.test("GET /api/docs/openapi.json returns valid OpenAPI 3.1 document", async () => {
    const { request, url } = createRequest("/api/docs/openapi.json", { method: "GET" });
    const res = await handleApiRouter(request, url);
    assert.strictEqual(res.status, 200);
    const body = (await res.json()) as { openapi: string; info: { title: string } };
    assert.strictEqual(body.openapi, "3.1.0");
    assert.ok(body.info.title.includes("TRACE"));
  });

  await t.test("GET /api/health and GET /api/ready return health and readiness", async () => {
    const { request: hReq, url: hUrl } = createRequest("/api/health", { method: "GET" });
    const hRes = await handleApiRouter(hReq, hUrl);
    assert.strictEqual(hRes.status, 200);
    const hBody = (await hRes.json()) as { status: string; version: string };
    assert.strictEqual(hBody.status, "healthy");
    assert.strictEqual(hBody.version, "8.0.0");

    const { request: rReq, url: rUrl } = createRequest("/api/ready", { method: "GET" });
    const rRes = await handleApiRouter(rReq, rUrl);
    assert.strictEqual(rRes.status, 200);
    const rBody = (await rRes.json()) as { status: string; database: string };
    assert.strictEqual(rBody.status, "ready");
    assert.strictEqual(rBody.database, "connected");
  });

  await t.test("POST /api/auth/login with valid credentials authenticates user", async () => {
    const { request, url } = createRequest("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username: "admin", password: "Admin123456!" }),
    });
    const res = await handleApiRouter(request, url);
    assert.strictEqual(res.status, 200);
    const body = (await res.json()) as { token: string; user: { role: string; username: string } };
    assert.ok(body.token);
    assert.strictEqual(body.user.role, "Administrator");
    adminToken = body.token;

    // Login viewer
    const { request: vReq, url: vUrl } = createRequest("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username: "viewer", password: "Viewer123!" }),
    });
    const vRes = await handleApiRouter(vReq, vUrl);
    assert.strictEqual(vRes.status, 200);
    const vBody = (await vRes.json()) as { token: string };
    viewerToken = vBody.token;
  });

  await t.test("POST /api/auth/login with invalid password returns 401", async () => {
    const { request, url } = createRequest("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username: "admin", password: "WrongPassword" }),
    });
    const res = await handleApiRouter(request, url);
    assert.strictEqual(res.status, 401);
  });

  await t.test(
    "GET /api/auth/me returns profile for authenticated user and 401 for anonymous",
    async () => {
      const { request, url } = createRequest("/api/auth/me", {
        method: "GET",
        headers: { authorization: `Bearer ${adminToken}` },
      });
      const res = await handleApiRouter(request, url);
      assert.strictEqual(res.status, 200);
      const body = (await res.json()) as { user: { username: string; role: string } };
      assert.strictEqual(body.user.username, "admin");

      const { request: anonReq, url: anonUrl } = createRequest("/api/auth/me", { method: "GET" });
      const anonRes = await handleApiRouter(anonReq, anonUrl);
      assert.strictEqual(anonRes.status, 401);
    },
  );

  await t.test("POST /api/incidents creates incident for Admin and forbids Viewer", async () => {
    // Forbidden for Viewer
    const { request: fReq, url: fUrl } = createRequest("/api/incidents", {
      method: "POST",
      headers: { authorization: `Bearer ${viewerToken}` },
      body: JSON.stringify({ name: "Unauthorized Incident", lat: 19.876, lon: 74.478 }),
    });
    const fRes = await handleApiRouter(fReq, fUrl);
    assert.strictEqual(fRes.status, 403);

    // Permitted for Admin
    const { request, url } = createRequest("/api/incidents", {
      method: "POST",
      headers: { authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        name: "North Quadrant Warehouse Fire",
        lat: 19.8812,
        lon: 74.4795,
        priority: "critical",
        description: "Industrial warehouse fire with thermal anomaly.",
      }),
    });
    const res = await handleApiRouter(request, url);
    assert.strictEqual(res.status, 201);
    const body = (await res.json()) as { id: string; name: string };
    assert.ok(body.id.startsWith("INC-"));
    createdIncidentId = body.id;
  });

  await t.test(
    "GET /api/incidents lists incidents and GET /api/incidents/:id retrieves details",
    async () => {
      const { request, url } = createRequest("/api/incidents", { method: "GET" });
      const res = await handleApiRouter(request, url);
      assert.strictEqual(res.status, 200);
      const body = (await res.json()) as { total: number; incidents: { id: string }[] };
      assert.ok(body.total >= 2);

      const { request: dReq, url: dUrl } = createRequest(`/api/incidents/${createdIncidentId}`, {
        method: "GET",
      });
      const dRes = await handleApiRouter(dReq, dUrl);
      assert.strictEqual(dRes.status, 200);
      const dBody = (await dRes.json()) as { name: string; priority: string };
      assert.strictEqual(dBody.name, "North Quadrant Warehouse Fire");
    },
  );

  await t.test(
    "PATCH /api/incidents/:id updates incident details and DELETE archives it",
    async () => {
      const { request: pReq, url: pUrl } = createRequest(`/api/incidents/${createdIncidentId}`, {
        method: "PATCH",
        headers: { authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ priority: "medium", status: "contained" }),
      });
      const pRes = await handleApiRouter(pReq, pUrl);
      assert.strictEqual(pRes.status, 200);
      const pBody = (await pRes.json()) as { priority: string; status: string };
      assert.strictEqual(pBody.priority, "medium");
      assert.strictEqual(pBody.status, "contained");

      // DELETE archives incident
      const { request: delReq, url: delUrl } = createRequest(
        `/api/incidents/${createdIncidentId}`,
        {
          method: "DELETE",
          headers: { authorization: `Bearer ${adminToken}` },
        },
      );
      const delRes = await handleApiRouter(delReq, delUrl);
      assert.strictEqual(delRes.status, 200);
      const delBody = (await delRes.json()) as { incident: { status: string } };
      assert.strictEqual(delBody.incident.status, "archived");
    },
  );

  await t.test(
    "POST /api/telemetry/ingest accepts valid packet, rejects out-of-bounds, handles duplicates",
    async () => {
      const now = Date.now();
      // Valid ingestion
      const { request, url } = createRequest("/api/telemetry/ingest", {
        method: "POST",
        body: JSON.stringify({
          messageId: "MSG-TEST-INGEST-01",
          nodeId: "station-alpha",
          seq: 501,
          source: "live",
          rssi: -72.0,
          battery: 91,
          lat: 19.877,
          lon: 74.478,
        }),
      });
      const res = await handleApiRouter(request, url);
      assert.strictEqual(res.status, 201);

      // Duplicate detection
      const { request: dupReq, url: dupUrl } = createRequest("/api/telemetry/ingest", {
        method: "POST",
        body: JSON.stringify({
          messageId: "MSG-TEST-INGEST-01",
          nodeId: "station-alpha",
          seq: 501,
          source: "live",
        }),
      });
      const dupRes = await handleApiRouter(dupReq, dupUrl);
      assert.strictEqual(dupRes.status, 200);
      const dupBody = (await dupRes.json()) as { status: string };
      assert.strictEqual(dupBody.status, "duplicate");

      // Out-of-bounds RSSI
      const { request: oobReq, url: oobUrl } = createRequest("/api/telemetry/ingest", {
        method: "POST",
        body: JSON.stringify({
          messageId: "MSG-TEST-INGEST-02",
          nodeId: "station-alpha",
          seq: 502,
          source: "live",
          rssi: 50.0, // Invalid: max +20 dBm
        }),
      });
      const oobRes = await handleApiRouter(oobReq, oobUrl);
      assert.strictEqual(oobRes.status, 400);
    },
  );

  await t.test("POST /api/localization/run executes engine and creates search zone", async () => {
    const observations = [
      {
        id: "obs-1",
        nodeId: "station-alpha",
        lat: 19.877,
        lon: 74.478,
        rssi: -65.0,
        timestamp: Date.now(),
      },
      {
        id: "obs-2",
        nodeId: "station-bravo",
        lat: 19.8755,
        lon: 74.4795,
        rssi: -72.0,
        timestamp: Date.now(),
      },
      {
        id: "obs-3",
        nodeId: "station-charlie",
        lat: 19.875,
        lon: 74.477,
        rssi: -68.0,
        timestamp: Date.now(),
      },
      {
        id: "obs-4",
        nodeId: "station-delta",
        lat: 19.8768,
        lon: 74.479,
        rssi: -61.0,
        timestamp: Date.now(),
      },
    ];

    const { request, url } = createRequest("/api/localization/run", {
      method: "POST",
      body: JSON.stringify({
        incidentId: "INC-2026-SECTOR-4",
        observations,
        sourceMode: "live",
      }),
    });
    const res = await handleApiRouter(request, url);
    assert.strictEqual(res.status, 200);
    const body = (await res.json()) as {
      runId: string;
      usableObservationCount: number;
      searchZone?: { radius: number };
    };
    assert.ok(body.runId.startsWith("LOC-"));
    assert.strictEqual(body.usableObservationCount, 4);
    assert.ok(body.searchZone);

    // Verify search zone query
    const { request: zReq, url: zUrl } = createRequest("/api/search-zones", { method: "GET" });
    const zRes = await handleApiRouter(zReq, zUrl);
    assert.strictEqual(zRes.status, 200);
    const zBody = (await zRes.json()) as { count: number };
    assert.ok(zBody.count >= 1);
  });

  await t.test("GET /api/alerts and PATCH /api/alerts/:id acknowledges alert", async () => {
    const { request, url } = createRequest("/api/alerts?status=active", { method: "GET" });
    const res = await handleApiRouter(request, url);
    assert.strictEqual(res.status, 200);
    const body = (await res.json()) as { count: number; alerts: { id: string }[] };
    assert.ok(body.count >= 1);
    const alertId = body.alerts[0].id;

    // Acknowledge alert
    const { request: aReq, url: aUrl } = createRequest(`/api/alerts/${alertId}`, {
      method: "PATCH",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const aRes = await handleApiRouter(aReq, aUrl);
    assert.strictEqual(aRes.status, 200);
    const aBody = (await aRes.json()) as { status: string };
    assert.strictEqual(aBody.status, "acknowledged");
  });

  await t.test(
    "GET /api/analytics/overview and /api/analytics/sensors return computed metrics",
    async () => {
      const { request, url } = createRequest("/api/analytics/overview", { method: "GET" });
      const res = await handleApiRouter(request, url);
      assert.strictEqual(res.status, 200);
      const body = (await res.json()) as { totalIncidents: number; registeredNodes: number };
      assert.ok(body.totalIncidents >= 1);
      assert.ok(body.registeredNodes >= 4);

      const { request: sReq, url: sUrl } = createRequest("/api/analytics/sensors", {
        method: "GET",
      });
      const sRes = await handleApiRouter(sReq, sUrl);
      assert.strictEqual(sRes.status, 200);
      const sBody = (await sRes.json()) as {
        totalSensors: number;
        batteryDistribution: { high: number };
      };
      assert.ok(sBody.totalSensors >= 4);
      assert.ok(sBody.batteryDistribution.high >= 1);
    },
  );

  closeDb();
});
