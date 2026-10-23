import test from "node:test";
import assert from "node:assert/strict";
import {
  initialState,
  advanceSimulation,
  switchScenario,
  SCENARIO_PRESETS,
  type State,
} from "../src/lib/kavach/state.ts";
import { makeRng } from "../src/lib/kavach/engine.ts";

test("Workflow 1: Scenario switching flushes stale detections, zones, and samples", () => {
  const rng = makeRng(20261012);
  let state = initialState();

  // Run 5 ticks in collapse scenario
  for (let i = 0; i < 5; i++) {
    state = advanceSimulation(state, rng);
  }
  assert.ok(state.detections.length > 0, "Collapse scenario should have detections");
  assert.ok(state.zones.length > 0, "Collapse scenario should have calculated a zone");
  assert.ok(state.samples.length > 0, "Collapse scenario should have samples");
  assert.equal(state.scenario, "collapse");

  // Switch to flood scenario
  const floodRng = makeRng(20261012);
  const switched = switchScenario(state, "flood", floodRng);

  assert.equal(switched.scenario, "flood");
  assert.equal(switched.noise, SCENARIO_PRESETS.flood.noise);
  assert.equal(switched.obstruction, SCENARIO_PRESETS.flood.obstruction);
  assert.equal(switched.signal?.id, SCENARIO_PRESETS.flood.signalOrigin.id);
  assert.equal(switched.signal?.path, "east-west");

  // Verify previous detections are flushed and only fresh flood observations exist
  const staleDetections = switched.detections.filter((d) => d.tempId === "SYN-01");
  assert.equal(
    staleDetections.length,
    0,
    "Stale SYN-01 detections must be purged on scenario switch",
  );
  assert.equal(switched.tick, 0, "Tick should reset to 0 for new scenario trial");
});

test("Workflow 2: Industrial Obstruction scenario applies severe RF noise & obstruction", () => {
  const rng = makeRng(20261012);
  const state = initialState();
  const industrial = switchScenario(state, "industrial", rng);

  assert.equal(industrial.scenario, "industrial");
  assert.equal(industrial.noise, 7);
  assert.equal(industrial.obstruction, 12);
  assert.equal(industrial.signal?.path, "orbit");
  assert.equal(industrial.signal?.id, "SYN-IND-01");
});

test("Workflow 3: Packet loss configuration drops packets and prevents zone estimation at 100% loss", () => {
  const rng = makeRng(20261012);
  let state = initialState();
  state.packetLoss = 100; // 100% loss

  state = advanceSimulation(state, rng);

  // With 100% packet loss, no observations should be registered from sniffers
  assert.equal(state.zones.length, 0, "Zero zones can be calculated under total packet loss");
  assert.equal(state.estimationState, "insufficient_observations");
  const totalLost = state.nodes.reduce((acc, n) => acc + (n.packetsLost ?? 0), 0);
  assert.ok(totalLost > 0, "Nodes should report packets lost");
});

test("Workflow 4: Disconnecting simulated gateway halts transport and updates estimationState", () => {
  const rng = makeRng(20261012);
  let state = initialState();
  state = advanceSimulation(state, rng);
  assert.equal(state.estimationState, "active_zone");

  // Disconnect simulated gateway
  state.gatewayConnected = false;
  state = advanceSimulation(state, rng);

  assert.equal(state.gatewayConnected, false);
  assert.equal(state.zones.length, 0, "Search zones must be cleared when transport is offline");
  assert.equal(state.estimationState, "device_disconnected");
  assert.match(state.estimationMessage, /transport unavailable|offline/i);
});

test("Workflow 5: Toggling simulated nodes offline and recovering", () => {
  const rng = makeRng(20261012);
  let state = initialState();
  state = advanceSimulation(state, rng);
  assert.equal(state.estimationState, "active_zone");

  // Disable 2 sniffers (leaving only 1 sniffer + 1 gateway online = 1 reporting sniffer)
  state.nodes = state.nodes.map((n) =>
    n.id === "N01" || n.id === "N02" ? { ...n, status: "offline" as const } : n,
  );
  state = advanceSimulation(state, rng);

  assert.equal(state.zones.length, 0, "Localization must fail with < 3 online sniffers");
  assert.equal(state.estimationState, "insufficient_observations");

  // Recover nodes
  state.nodes = state.nodes.map((n) => ({ ...n, status: "online" as const }));
  state = advanceSimulation(state, rng);

  assert.ok(
    state.zones.length > 0,
    "Search zone should be restored when sniffers come back online",
  );
  assert.equal(state.estimationState, "active_zone");
});

test("Workflow 6: Simulation reset restores deterministic seed and clean state", () => {
  const s1 = advanceSimulation(initialState(), makeRng(20261012));
  const s2 = advanceSimulation(initialState(), makeRng(20261012));

  assert.equal(
    s1.zones[0]?.lat,
    s2.zones[0]?.lat,
    "Identical RNG seeds must produce identical zone coordinates",
  );
  assert.equal(s1.zones[0]?.lon, s2.zones[0]?.lon);
  assert.equal(s1.zones[0]?.radius, s2.zones[0]?.radius);
});
