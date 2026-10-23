import test from "node:test";
import assert from "node:assert/strict";
import {
  initialState,
  advanceSimulation,
  switchMode,
  ingestHardwarePacket,
  type State,
} from "../src/lib/kavach/state.ts";
import type { TelemetryPacket } from "../src/lib/kavach/types.ts";

test("P4-A: Initial state starts in simulation mode with synthetic data", () => {
  const state = initialState();
  assert.equal(state.mode, "simulation");
  assert.equal(state.running, true);
  assert.ok(state.signal !== null, "Simulation mode must have a synthetic source");
  assert.equal(state.signal?.id, "SYN-01");
  assert.equal(state.nodes.length, 4);
  assert.equal(state.gatewayConnected, true);
  assert.equal(state.estimationState, "active_zone");
});

test("P4-B & C: Switching to live hardware mode stops simulation and clears synthetic source", () => {
  const simState = initialState();
  const { nextState: liveState } = switchMode(simState, "live", null, null, (s) => s);

  assert.equal(liveState.mode, "live");
  assert.equal(liveState.running, false, "Live mode must not run simulation timer");
  assert.equal(liveState.signal, null, "Live mode must NOT contain any synthetic signal source");
  assert.equal(liveState.nodes.length, 0, "Initial live mode must not retain synthetic nodes");
  assert.equal(liveState.detections.length, 0, "Live mode must have zero synthetic detections");
  assert.equal(liveState.zones.length, 0, "Live mode must not have synthetic search zones");
  assert.equal(liveState.tick, 0);
  assert.equal(liveState.gatewayConnected, false, "Live mode must not assume gateway is connected");
});

test("P4-D: advanceSimulation refuses to generate events when in live mode", () => {
  const simState = initialState();
  const { nextState: liveState } = switchMode(simState, "live", null, null, (s) => s);

  const advanced = advanceSimulation(liveState, Math.random);
  assert.deepEqual(
    advanced,
    liveState,
    "advanceSimulation must return state unchanged when mode is not simulation",
  );
  assert.equal(advanced.signal, null);
  assert.equal(advanced.detections.length, 0);
});

test("P4-E & F: Live mode without connected gateway reports waiting for telemetry", () => {
  const simState = initialState();
  const { nextState: liveState } = switchMode(simState, "live", null, null, (s) => s);

  assert.equal(liveState.gatewayConnected, false);
  assert.equal(liveState.estimationState, "no_observations");
  assert.ok(
    liveState.estimationMessage.includes("Awaiting telemetry") ||
      liveState.estimationMessage.includes("Live hardware mode active"),
    "Live mode without telemetry must indicate awaiting data, not fabricate connections",
  );
});

test("P4-G & H: Disconnecting gateway updates estimationState to device_disconnected", () => {
  let simState = initialState();
  // Simulate gateway disconnect in simulation mode
  simState = {
    ...simState,
    gatewayConnected: false,
    nodes: simState.nodes.map((n) =>
      n.type === "gateway" ? { ...n, status: "offline" as const } : n,
    ),
  };
  const afterAdvance = advanceSimulation(simState, Math.random);
  assert.equal(afterAdvance.estimationState, "device_disconnected");
  assert.equal(
    afterAdvance.zones.length,
    0,
    "Zones must be suppressed when gateway is disconnected",
  );
  assert.ok(
    afterAdvance.estimationMessage.includes("unavailable") ||
      afterAdvance.estimationMessage.includes("offline"),
  );
});

test("P4-I & J: Returning to simulation mode does not leak live state or corrupt simulation", () => {
  const simOriginal = initialState();
  const { nextState: liveState, newSimCache } = switchMode(
    simOriginal,
    "live",
    null,
    null,
    (s) => s,
  );

  // In live mode, ingest a foreign live node
  const liveWithNode: State = {
    ...liveState,
    nodes: [
      {
        id: "HW-99",
        label: "Live sensor",
        lat: 19.88,
        lon: 74.48,
        status: "online",
        battery: 99,
        sound: 40,
        vibration: 0.05,
        temperature: 28,
        bleDetected: 1,
        wifiDetected: 0,
        rssi: -70,
        loraRssi: -80,
        loraSnr: 9,
        lastPacket: Date.now(),
        sensorHealth: {},
        hops: 1,
      },
    ],
  };

  // Switch back to simulation
  const { nextState: restoredSim } = switchMode(
    liveWithNode,
    "simulation",
    newSimCache,
    liveWithNode,
    (s) => advanceSimulation(s, () => 0.5),
  );

  assert.equal(restoredSim.mode, "simulation");
  assert.ok(restoredSim.signal !== null, "Simulation signal must be restored");
  assert.equal(restoredSim.signal?.id, "SYN-01");
  assert.ok(
    !restoredSim.nodes.some((n) => n.id === "HW-99"),
    "Hardware node HW-99 must NOT leak into simulation state",
  );
  assert.equal(restoredSim.nodes.length, 4);
});

test("P4-K: Telemetry ingestion boundary rejects malformed or expired packets", () => {
  const simState = initialState();
  const { nextState: liveState } = switchMode(simState, "live", null, null, (s) => s);

  // Malformed packet: non-finite latitude
  const malformedPacket = {
    nodeId: "N01",
    latitude: Number.NaN,
    longitude: 74.4785,
    sound: 35,
    vibration: 0.04,
    temperature: 28,
    bleDetected: 1,
    wifiDetected: 0,
    rssi: -70,
    battery: 90,
    timestamp: Date.now(),
    loraRssi: -80,
    loraSnr: 9,
  } as unknown as TelemetryPacket;

  const afterMalformed = ingestHardwarePacket(liveState, malformedPacket);
  assert.equal(afterMalformed.nodes.length, 0, "Malformed packet must not create or modify nodes");

  // Expired packet: timestamp 10 minutes ago
  const expiredPacket: TelemetryPacket = {
    nodeId: "N01",
    latitude: 19.8762,
    longitude: 74.4785,
    sound: 35,
    vibration: 0.04,
    temperature: 28,
    bleDetected: 1,
    wifiDetected: 0,
    rssi: -70,
    battery: 90,
    timestamp: Date.now() - 600 * 1000, // 600 seconds old (expiry is 30s)
    loraRssi: -80,
    loraSnr: 9,
  };

  const afterExpired = ingestHardwarePacket(liveState, expiredPacket);
  assert.equal(afterExpired.nodes.length, 0, "Expired packet must be discarded");
});

test("P4-L: Hardware packet ingestion triggers live multilateration when ≥3 sniffers report", () => {
  const simState = initialState();
  let { nextState: liveState } = switchMode(simState, "live", null, null, (s) => s);

  const now = Date.now();

  // Ingest Gateway packet first
  liveState = ingestHardwarePacket(liveState, {
    nodeId: "GW-01",
    latitude: 19.8762,
    longitude: 74.4785,
    sound: 30,
    vibration: 0.02,
    temperature: 27,
    bleDetected: 0,
    wifiDetected: 0,
    rssi: -90,
    battery: 95,
    timestamp: now,
    loraRssi: -60,
    loraSnr: 12,
  });

  assert.equal(
    liveState.gatewayConnected,
    true,
    "Gateway packet should connect hardware transport",
  );
  assert.equal(liveState.zones.length, 0, "No zones yet with only gateway");

  // Ingest Sniffer 1
  liveState = ingestHardwarePacket(liveState, {
    nodeId: "SN-01",
    latitude: 19.875,
    longitude: 74.477,
    sound: 45,
    vibration: 0.08,
    temperature: 28.5,
    bleDetected: 1,
    wifiDetected: 0,
    rssi: -65,
    battery: 88,
    timestamp: now,
    loraRssi: -75,
    loraSnr: 10,
  });
  assert.equal(liveState.estimationState, "insufficient_observations");
  assert.equal(liveState.zones.length, 0);

  // Ingest Sniffer 2
  liveState = ingestHardwarePacket(liveState, {
    nodeId: "SN-02",
    latitude: 19.877,
    longitude: 74.48,
    sound: 42,
    vibration: 0.07,
    temperature: 29.0,
    bleDetected: 1,
    wifiDetected: 0,
    rssi: -72,
    battery: 82,
    timestamp: now,
    loraRssi: -78,
    loraSnr: 8,
  });
  assert.equal(liveState.estimationState, "insufficient_observations");
  assert.equal(liveState.zones.length, 0);

  // Ingest Sniffer 3 (completes triangle)
  liveState = ingestHardwarePacket(liveState, {
    nodeId: "SN-03",
    latitude: 19.874,
    longitude: 74.4805,
    sound: 40,
    vibration: 0.06,
    temperature: 28.2,
    bleDetected: 1,
    wifiDetected: 0,
    rssi: -68,
    battery: 79,
    timestamp: now,
    loraRssi: -82,
    loraSnr: 7,
  });

  // Now 3 sniffers are reporting to an active gateway!
  assert.equal(liveState.estimationState, "active_zone");
  assert.equal(liveState.zones.length, 1);
  const zone = liveState.zones[0]!;
  assert.equal(zone.id, "ZONE-HW-01");
  assert.equal(zone.note, "Verified hardware probable search zone");
  assert.ok(Number.isFinite(zone.lat));
  assert.ok(Number.isFinite(zone.lon));
  assert.ok(Number.isFinite(zone.radius));
  assert.ok(zone.radius >= 8 && zone.radius <= 120);
  assert.ok(Number.isFinite(zone.confidence));
  assert.equal(zone.contributingNodes.length, 3);
});

test("P4-M: Distinguishes all 4 localization failure states accurately", () => {
  const simState = initialState();
  let { nextState: liveState } = switchMode(simState, "live", null, null, (s) => s);

  // State 1: No observations received
  assert.equal(liveState.estimationState, "no_observations");

  // State 2: Disconnected device (gateway offline)
  const now = Date.now();
  liveState = ingestHardwarePacket(liveState, {
    nodeId: "SN-01",
    latitude: 19.875,
    longitude: 74.477,
    sound: 35,
    vibration: 0.04,
    temperature: 28,
    bleDetected: 1,
    wifiDetected: 0,
    rssi: -65,
    battery: 90,
    timestamp: now,
    loraRssi: -80,
    loraSnr: 8,
  });
  assert.equal(liveState.estimationState, "device_disconnected");

  // Reconnect gateway
  liveState = ingestHardwarePacket(liveState, {
    nodeId: "GW-01",
    latitude: 19.8762,
    longitude: 74.4785,
    sound: 30,
    vibration: 0.02,
    temperature: 27,
    bleDetected: 0,
    wifiDetected: 0,
    rssi: -90,
    battery: 95,
    timestamp: now,
    loraRssi: -60,
    loraSnr: 12,
  });
  // State 3: Insufficient observations (only 1 sniffer SN-01)
  assert.equal(liveState.estimationState, "insufficient_observations");

  // Ingest two collinear sniffers along the same latitude line
  liveState = ingestHardwarePacket(liveState, {
    nodeId: "SN-02",
    latitude: 19.875,
    longitude: 74.48,
    sound: 35,
    vibration: 0.04,
    temperature: 28,
    bleDetected: 1,
    wifiDetected: 0,
    rssi: -70,
    battery: 90,
    timestamp: now,
    loraRssi: -80,
    loraSnr: 8,
  });
  liveState = ingestHardwarePacket(liveState, {
    nodeId: "SN-03",
    latitude: 19.875,
    longitude: 74.483,
    sound: 35,
    vibration: 0.04,
    temperature: 28,
    bleDetected: 1,
    wifiDetected: 0,
    rssi: -75,
    battery: 90,
    timestamp: now,
    loraRssi: -80,
    loraSnr: 8,
  });
  // State 4: Valid observations with unsupported localization result (collinear geometry)
  assert.equal(liveState.estimationState, "unsupported_localization");
});
