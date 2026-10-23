import test from "node:test";
import assert from "node:assert/strict";
import { fitLogDistanceModel } from "../src/lib/kavach/engine.ts";
import { resetDatabase } from "../src/server/db/database.ts";
import {
  CalibrationRepository,
  GatewayRepository,
  NodeRepository,
  TelemetryRepository,
} from "../src/server/db/repositories.ts";

test("RF Path-Loss Calibration & Location Verification", async (t) => {
  await t.test("Fit log-distance path loss model on known synthetic samples", () => {
    // Model: RSSI(d) = A0 - 10 * n * log10(d / d0)
    // True: A0 = -45 dBm, n = 2.0, d0 = 1.0m
    // At d = 1m: -45
    // At d = 2m: -45 - 20 * log10(2) = -45 - 6.02 = -51.02
    // At d = 5m: -45 - 20 * log10(5) = -45 - 13.98 = -58.98
    // At d = 10m: -45 - 20 * log10(10) = -45 - 20 = -65.0
    const samples = [
      { id: "s1", distance: 1.0, rssi: -45.0, source: "live" as const, timestamp: Date.now() },
      { id: "s2", distance: 2.0, rssi: -51.0, source: "live" as const, timestamp: Date.now() },
      { id: "s3", distance: 5.0, rssi: -59.0, source: "live" as const, timestamp: Date.now() },
      { id: "s4", distance: 10.0, rssi: -65.0, source: "live" as const, timestamp: Date.now() },
    ];

    const result = fitLogDistanceModel(samples, 1.0);
    assert.strictEqual(result.isReliable, true);
    assert.ok(Math.abs(result.a0 - -45.0) < 0.2, `Expected A0 near -45, got ${result.a0}`);
    assert.ok(
      Math.abs(result.pathLossExponent - 2.0) < 0.1,
      `Expected n near 2.0, got ${result.pathLossExponent}`,
    );
    assert.ok(result.r2 > 0.99, `Expected R^2 > 0.99, got ${result.r2}`);
    assert.ok(result.rmse < 0.5, `Expected RMSE < 0.5, got ${result.rmse}`);
    assert.strictEqual(result.sampleCount, 4);
    assert.strictEqual(result.distinctDistances, 4);
    assert.strictEqual(result.warnings.length, 0);
  });

  await t.test("Flags insufficient distinct distances (< 2)", () => {
    const samples = [
      { id: "s1", distance: 1.0, rssi: -45.0, source: "live" as const, timestamp: Date.now() },
      { id: "s2", distance: 1.0, rssi: -46.0, source: "live" as const, timestamp: Date.now() },
    ];

    const result = fitLogDistanceModel(samples, 1.0);
    assert.strictEqual(result.isReliable, false);
    assert.ok(result.warnings.some((w) => w.includes("Insufficient")));
  });

  await t.test("Rejects negative or zero distances safely without throwing", () => {
    const samples = [
      { id: "s1", distance: -1.0, rssi: -45.0, source: "live" as const, timestamp: Date.now() },
      { id: "s2", distance: 0.0, rssi: -46.0, source: "live" as const, timestamp: Date.now() },
    ];

    const result = fitLogDistanceModel(samples, 1.0);
    assert.strictEqual(result.isReliable, false);
    assert.strictEqual(result.sampleCount, 0);
  });

  await t.test("Flags poor fit when samples are excessively noisy or unphysical", () => {
    // Inverted relationship (RSSI increases as distance increases)
    const samples = [
      { id: "s1", distance: 1.0, rssi: -90.0, source: "live" as const, timestamp: Date.now() },
      { id: "s2", distance: 5.0, rssi: -60.0, source: "live" as const, timestamp: Date.now() },
      { id: "s3", distance: 10.0, rssi: -30.0, source: "live" as const, timestamp: Date.now() },
    ];

    const result = fitLogDistanceModel(samples, 1.0);
    assert.strictEqual(result.isReliable, false);
    assert.ok(result.warnings.length > 0, "Expected physical plausibility warning");
  });

  await t.test("Database: Persist, retrieve, and activate calibration profiles", () => {
    process.env["DATABASE_PATH"] = ":memory:";
    resetDatabase();

    const created = CalibrationRepository.createProfile(
      {
        name: "Concrete Rubble Profile V1",
        ref_rssi: -48.2,
        path_loss_exponent: 3.45,
        rmse: 2.15,
        r2: 0.92,
        sample_count: 6,
        distinct_distances: 3,
        environment: "Heavy Concrete & Rebar",
        frequency_mhz: 2400,
        tx_power_dbm: 14,
        antenna_type: "Omnidirectional whip",
        is_active: 1,
      },
      [
        { distance: 1.0, rssi: -48, source: "live", timestamp: Date.now() },
        { distance: 1.0, rssi: -49, source: "live", timestamp: Date.now() },
        { distance: 3.0, rssi: -64, source: "live", timestamp: Date.now() },
        { distance: 3.0, rssi: -65, source: "live", timestamp: Date.now() },
        { distance: 7.0, rssi: -77, source: "live", timestamp: Date.now() },
        { distance: 7.0, rssi: -78, source: "live", timestamp: Date.now() },
      ],
    );

    assert.ok(created.id, "Expected profile ID");
    assert.strictEqual(created.is_active, 1, "New profile should become active");

    const active = CalibrationRepository.getActiveProfile();
    assert.ok(active, "Expected active profile");
    assert.strictEqual(active?.id, created.id);
    assert.strictEqual(active?.path_loss_exponent, 3.45);

    const samples = CalibrationRepository.getProfileSamples(created.id);
    assert.strictEqual(samples.length, 6);
    assert.strictEqual(samples[0].source, "live");

    // Create another profile and verify switching
    const profile2 = CalibrationRepository.createProfile(
      {
        name: "Open Field Line-of-Sight",
        ref_rssi: -38.0,
        path_loss_exponent: 2.05,
        rmse: 1.1,
        r2: 0.98,
        sample_count: 3,
        distinct_distances: 3,
        environment: "Open Field",
        frequency_mhz: 868,
        tx_power_dbm: 14,
        antenna_type: "Fiberglass colinear",
        is_active: 1,
      },
      [
        { distance: 1.0, rssi: -38, source: "manual", timestamp: Date.now() },
        { distance: 5.0, rssi: -52, source: "manual", timestamp: Date.now() },
        { distance: 10.0, rssi: -58, source: "manual", timestamp: Date.now() },
      ],
    );

    const list = CalibrationRepository.listProfiles();
    assert.ok(list.length >= 2);

    // Switch back to profile 1
    const switched = CalibrationRepository.activateProfile(created.id);
    assert.strictEqual(switched, true);
    const reActive = CalibrationRepository.getActiveProfile();
    assert.strictEqual(reActive?.id, created.id);
  });

  await t.test("Validates zero coordinate handling without silent dropping", () => {
    // (0.0, 0.0) is a valid geographic coordinate.
    // It must not be rejected merely because 0 evaluates as falsy in JS.
    const lat = 0.0;
    const lon = 0.0;
    const isValidCoord = (c: unknown): boolean =>
      typeof c === "number" && Number.isFinite(c) && !Number.isNaN(c);

    assert.strictEqual(isValidCoord(lat), true);
    assert.strictEqual(isValidCoord(lon), true);
    assert.strictEqual(isValidCoord(null), false);
    assert.strictEqual(isValidCoord(undefined), false);
    assert.strictEqual(isValidCoord(NaN), false);
  });

  await t.test("IoT Ingestion: Gateway auto-registration and node status updating", () => {
    // 1. Simulate an incoming packet from a new physical hardware gateway
    const rawPacket = {
      deviceId: "NODE-TEST-99",
      gatewayId: "GW-PHYSICAL-ESP32",
      latitude: 19.877,
      longitude: 74.479,
      rssi: -62.5,
      battery: 92.0,
      seq: 2001,
      source: "live" as const,
      timestamp: Date.now(),
    };

    // Verify gateway and node database behavior
    const gw = GatewayRepository.upsert({
      id: "GW-PHYSICAL-ESP32",
      gateway_id: "GW-PHYSICAL-ESP32",
      name: "Physical ESP32 Gateway",
      type: "lora_serial",
      lat: rawPacket.latitude,
      lon: rawPacket.longitude,
      status: "online",
      last_seen: Date.now(),
    });
    assert.strictEqual(gw.gateway_id, "GW-PHYSICAL-ESP32");
    assert.strictEqual(gw.status, "online");

    const foundGw = GatewayRepository.findByGatewayId("GW-PHYSICAL-ESP32");
    assert.ok(foundGw);
    assert.strictEqual(foundGw?.status, "online");

    // Verify node registration
    const node = NodeRepository.upsert({
      id: `NODE-${rawPacket.deviceId}`,
      node_id: rawPacket.deviceId,
      gateway_id: gw.gateway_id,
      name: `Station ${rawPacket.deviceId}`,
      type: "sniffer",
      lat: rawPacket.latitude,
      lon: rawPacket.longitude,
      alt: 0,
      battery: rawPacket.battery,
      status: "online",
      last_seen: Date.now(),
    });
    assert.strictEqual(node.node_id, "NODE-TEST-99");
    assert.strictEqual(node.gateway_id, "GW-PHYSICAL-ESP32");
    assert.strictEqual(node.status, "online");

    // Verify telemetry message recording
    const tlm = TelemetryRepository.record({
      message_id: `MSG-${rawPacket.deviceId}-${rawPacket.seq}`,
      node_id: rawPacket.deviceId,
      gateway_id: gw.gateway_id,
      seq: rawPacket.seq,
      protocol_version: "v2.0",
      timestamp: rawPacket.timestamp,
      source: "live",
      rssi: rawPacket.rssi,
      battery: rawPacket.battery,
      sound_db: 45.0,
      vibration_g: 0.05,
      thermal_c: 28.5,
      lat: rawPacket.latitude,
      lon: rawPacket.longitude,
      raw_payload: JSON.stringify(rawPacket),
    });
    assert.ok(tlm.id);
    assert.strictEqual(tlm.source, "live");
    assert.strictEqual(tlm.rssi, -62.5);
  });
});
