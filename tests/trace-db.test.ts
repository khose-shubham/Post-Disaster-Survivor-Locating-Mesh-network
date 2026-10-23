import test from "node:test";
import assert from "node:assert/strict";
import {
  getDb,
  closeDb,
  resetDatabase,
  hashPassword,
  verifyPassword,
} from "../src/server/db/database.ts";
import {
  UserRepository,
  SessionRepository,
  IncidentRepository,
  NodeRepository,
  GatewayRepository,
  TelemetryRepository,
  ObservationRepository,
  LocalizationRepository,
  AnalyticsRepository,
} from "../src/server/db/repositories.ts";

test("Database & Persistence Layer Tests", async (t) => {
  // Use isolated in-memory testing
  process.env["DATABASE_PATH"] = ":memory:";
  resetDatabase();

  await t.test("Password hashing with scrypt and constant-time verification", () => {
    const creds = hashPassword("TestSecret!2026");
    assert.ok(creds.hash.length > 32);
    assert.ok(creds.salt.length > 16);
    assert.strictEqual(verifyPassword("TestSecret!2026", creds.hash, creds.salt), true);
    assert.strictEqual(verifyPassword("WrongPassword", creds.hash, creds.salt), false);
  });

  await t.test("Database initialization seeds default users and demo incident", () => {
    const admin = UserRepository.findByUsername("admin");
    assert.ok(admin, "Admin user should be seeded");
    assert.strictEqual(admin?.role, "Administrator");
    assert.strictEqual(verifyPassword("Admin123456!", admin.password_hash, admin.salt), true);

    const commander = UserRepository.findByUsername("commander");
    assert.ok(commander, "Commander user should be seeded");
    assert.strictEqual(commander?.role, "Incident Commander");

    const incidents = IncidentRepository.list();
    assert.ok(incidents.total >= 1);
    const demoInc = incidents.incidents[0];
    assert.ok(demoInc.name.includes("Sector 4"));
    assert.strictEqual(demoInc.status, "active");
  });

  await t.test("Session lifecycle: creation, retrieval, and deletion", () => {
    const admin = UserRepository.findByUsername("admin");
    assert.ok(admin);

    const rawToken = "test-session-token-xyz-123";
    const session = SessionRepository.create(
      admin.id,
      rawToken,
      3600000,
      "127.0.0.1",
      "NodeTest/1.0",
    );
    assert.ok(session.id.startsWith("SESS-"));

    const found = SessionRepository.findByToken(rawToken);
    assert.ok(found);
    assert.strictEqual(found.user.username, "admin");
    assert.strictEqual(found.session.id, session.id);

    // Delete session
    SessionRepository.deleteByToken(rawToken);
    const deleted = SessionRepository.findByToken(rawToken);
    assert.strictEqual(deleted, null);
  });

  await t.test("Sensor Nodes & Gateways upsert and inventory query", () => {
    const nodes = NodeRepository.list();
    assert.ok(nodes.length >= 4, "Should have 4 seeded sniffer nodes");

    const updated = NodeRepository.upsert({
      id: "NODE-A",
      node_id: "station-alpha",
      gateway_id: "GW-PRIMARY-ALPHA",
      name: "Station Alpha (Calibrated)",
      type: "sniffer",
      lat: 19.877,
      lon: 74.478,
      alt: 510.0,
      battery: 99,
      status: "online",
      last_seen: Date.now(),
    });
    assert.strictEqual(updated.name, "Station Alpha (Calibrated)");
    assert.strictEqual(updated.battery, 99);
  });

  await t.test("Telemetry message insertion and duplicate prevention", () => {
    const now = Date.now();
    const tlm = TelemetryRepository.record({
      message_id: "MSG-UNIQUE-001",
      node_id: "station-alpha",
      gateway_id: "GW-PRIMARY-ALPHA",
      seq: 101,
      protocol_version: "v2.0",
      timestamp: now,
      source: "live",
      rssi: -65.5,
      battery: 95,
      sound_db: 42.1,
      vibration_g: 0.05,
      thermal_c: 28.2,
      lat: 19.877,
      lon: 74.478,
    });
    assert.ok(tlm.id.startsWith("TLM-"));

    const found = TelemetryRepository.findByMessageId("MSG-UNIQUE-001");
    assert.ok(found);
    assert.strictEqual(found.rssi, -65.5);

    // Uniqueness constraint check
    assert.throws(() => {
      TelemetryRepository.record({
        message_id: "MSG-UNIQUE-001", // duplicate
        node_id: "station-alpha",
        seq: 102,
        protocol_version: "v2.0",
        timestamp: now,
        source: "live",
      });
    });
  });

  await t.test("Analytics aggregation calculates live database counts", () => {
    const overview = AnalyticsRepository.getOverview();
    assert.ok(overview.totalIncidents >= 1);
    assert.ok(overview.registeredNodes >= 4);
    assert.ok(overview.totalTelemetryMessages >= 1);
  });

  closeDb();
});
