import test from "node:test";
import assert from "node:assert/strict";
import { runEstimationPipeline, type LocalizationInput } from "../src/lib/kavach/engine.ts";
import {
  initialState,
  advanceSimulation,
  switchMode,
  DEFAULT_CALIBRATION,
} from "../src/lib/kavach/state.ts";

test("V6 Pipeline 1: Transparent estimation pipeline rejection tracking and explicit reasons", () => {
  const testObs: LocalizationInput[] = [
    // Valid node 1
    {
      nodeId: "SNIFF-01",
      lat: 19.8762,
      lon: 74.4785,
      rssi: -65,
      age: 5,
    },
    // Stale node (> 60s ago)
    {
      nodeId: "SNIFF-02",
      lat: 19.877,
      lon: 74.4785,
      rssi: -70,
      age: 85,
    },
    // Invalid RSSI (< -150 dBm)
    {
      nodeId: "SNIFF-03",
      lat: 19.8765,
      lon: 74.479,
      rssi: -160,
      age: 2,
    },
    // NaN coordinate
    {
      nodeId: "SNIFF-04",
      lat: NaN,
      lon: 74.4785,
      rssi: -60,
      age: 1,
    },
    // Non-finite RSSI
    {
      nodeId: "SNIFF-05",
      lat: 19.8768,
      lon: 74.4782,
      rssi: Infinity,
      age: 1,
    },
  ];

  const report = runEstimationPipeline(testObs, DEFAULT_CALIBRATION, "simulation");

  assert.equal(report.totalInputObservations, 5);
  assert.equal(report.usableObservationCount, 1, "Only SNIFF-01 should be usable");
  assert.equal(report.rejectedObservations.length, 4, "4 observations must be explicitly rejected");

  const staleRej = report.rejectedObservations.find((r) => r.nodeId === "SNIFF-02");
  assert.ok(staleRej, "SNIFF-02 must be in rejected list");
  assert.match(staleRej.reason, /Observation stale/i);

  const rssiRej = report.rejectedObservations.find((r) => r.nodeId === "SNIFF-03");
  assert.ok(rssiRej, "SNIFF-03 must be rejected for RSSI bounds");
  assert.match(rssiRej.reason, /out of physical bounds/i);

  const nanCoordRej = report.rejectedObservations.find((r) => r.nodeId === "SNIFF-04");
  assert.ok(nanCoordRej, "SNIFF-04 must be rejected for non-finite coordinates");
  assert.match(nanCoordRej.reason, /Invalid or non-finite geographic coordinates/i);

  const infRssiRej = report.rejectedObservations.find((r) => r.nodeId === "SNIFF-05");
  assert.ok(infRssiRej, "SNIFF-05 must be rejected for non-finite RSSI");
  assert.match(infRssiRej.reason, /Missing or non-finite RSSI/i);
});

test("V6 Pipeline 2: GDOP and Geometry calculation with spatial warnings", () => {
  // Collinear stations along longitude 74.4780
  const collinearObs: LocalizationInput[] = [
    { nodeId: "N1", lat: 19.876, lon: 74.478, rssi: -60, age: 1 },
    { nodeId: "N2", lat: 19.877, lon: 74.478, rssi: -62, age: 1 },
    { nodeId: "N3", lat: 19.878, lon: 74.478, rssi: -65, age: 1 },
  ];

  const colReport = runEstimationPipeline(collinearObs, DEFAULT_CALIBRATION, "simulation");
  assert.ok(
    colReport.warnings.some((w) => w.toLowerCase().includes("collinear")),
    "Must warn on collinear sensor geometry",
  );
  assert.ok(
    colReport.gdop != null && colReport.gdop >= 5.0,
    "Collinear nodes must produce elevated GDOP dilution",
  );

  // Well distributed 4-point constellation
  const wellObs: LocalizationInput[] = [
    { nodeId: "N1", lat: 19.876, lon: 74.478, rssi: -60, age: 1 },
    { nodeId: "N2", lat: 19.876, lon: 74.4795, rssi: -62, age: 1 },
    { nodeId: "N3", lat: 19.8775, lon: 74.478, rssi: -65, age: 1 },
    { nodeId: "N4", lat: 19.877, lon: 74.479, rssi: -63, age: 1 },
  ];

  const wellReport = runEstimationPipeline(wellObs, DEFAULT_CALIBRATION, "simulation");
  assert.ok(
    wellReport.searchZone != null,
    "Well distributed points must produce valid search zone",
  );
  assert.ok(
    wellReport.gdop != null && wellReport.gdop < 3.0,
    "Well-spread stations should have healthy GDOP < 3.0",
  );
  assert.equal(wellReport.eligibilityStatus, "active_zone");
});

test("V6 Pipeline 3: Transparent Operational State Distinction across conditions", () => {
  // Condition 1: No observations
  const repEmpty = runEstimationPipeline([], DEFAULT_CALIBRATION, "simulation");
  assert.equal(repEmpty.eligibilityStatus, "no_observations");
  assert.equal(repEmpty.searchZone, null);

  // Condition 2: Observations received but all invalid
  const repInvalid = runEstimationPipeline(
    [{ nodeId: "N1", lat: 19.8762, lon: 74.4785, rssi: -160, age: 1 }],
    DEFAULT_CALIBRATION,
    "simulation",
  );
  assert.equal(repInvalid.eligibilityStatus, "observations_invalid");
  assert.equal(repInvalid.searchZone, null);

  // Condition 3: Valid observations but insufficient geometry (< 3 stations)
  const repInsufficient = runEstimationPipeline(
    [
      { nodeId: "N1", lat: 19.876, lon: 74.478, rssi: -65, age: 1 },
      { nodeId: "N2", lat: 19.877, lon: 74.4785, rssi: -68, age: 1 },
    ],
    DEFAULT_CALIBRATION,
    "simulation",
  );
  assert.equal(repInsufficient.eligibilityStatus, "insufficient_evidence");
  assert.equal(repInsufficient.searchZone, null);

  // Condition 4: Valid estimate produced (>= 3 stations)
  const repValid = runEstimationPipeline(
    [
      { nodeId: "N1", lat: 19.876, lon: 74.478, rssi: -65, age: 1 },
      { nodeId: "N2", lat: 19.876, lon: 74.4795, rssi: -68, age: 1 },
      { nodeId: "N3", lat: 19.8775, lon: 74.478, rssi: -70, age: 1 },
    ],
    DEFAULT_CALIBRATION,
    "simulation",
  );
  assert.equal(repValid.eligibilityStatus, "active_zone");
  assert.ok(repValid.searchZone != null);
  assert.ok(repValid.searchZone.radius > 0, "Search zone must have positive uncertainty radius");
});

test("V6 Workbench 1: Deterministic simulation repeatability with pseudo-random generator", () => {
  const base = initialState();

  // Custom deterministic pseudo-random generator
  const createRng = (seed: number) => {
    let s = seed;
    return () => {
      s = (s * 16807) % 2147483647;
      return (s - 1) / 2147483646;
    };
  };

  const rngA = createRng(20261012);
  const stateA1 = advanceSimulation(base, rngA);
  const stateA2 = advanceSimulation(stateA1, rngA);

  const rngB = createRng(20261012);
  const stateB1 = advanceSimulation(base, rngB);
  const stateB2 = advanceSimulation(stateB1, rngB);

  assert.equal(stateA2.zones.length, stateB2.zones.length, "Zone count must match exactly");
  if (stateA2.zones[0] && stateB2.zones[0]) {
    assert.equal(
      stateA2.zones[0].x,
      stateB2.zones[0].x,
      "Calculated zone X coordinate must match bit-for-bit",
    );
    assert.equal(
      stateA2.zones[0].y,
      stateB2.zones[0].y,
      "Calculated zone Y coordinate must match bit-for-bit",
    );
    assert.equal(
      stateA2.zones[0].radius,
      stateB2.zones[0].radius,
      "Calculated uncertainty radius must match",
    );
  }
});

test("V6 Auditability 1: Append-only AppEvent history & event structure", () => {
  const state = initialState();
  assert.ok(Array.isArray(state.events), "state.events must be initialized as an array");
  assert.ok(state.events.length > 0, "Initial bootstrap events must be present");

  const bootstrapEvent = state.events[0];
  assert.ok(bootstrapEvent?.id, "Event must have unique id");
  assert.ok(bootstrapEvent?.ts, "Event must have ts timestamp");
  assert.ok(bootstrapEvent?.type, "Event must have typed event tag");
  assert.equal(bootstrapEvent?.severity, "info");
});

test("V6 Integrity 1: Live hardware mode preserves isolation from synthetic simulation", () => {
  const simState = initialState();
  const { nextState: liveState } = switchMode(simState, "live", null, null, (s) => s);

  assert.equal(liveState.mode, "live", "Mode must transition to live");
  assert.equal(liveState.running, false, "Simulation runner must stop in live mode");
  assert.equal(liveState.signal, null, "Synthetic signal source must be cleared");
  assert.equal(liveState.zones.length, 0, "Synthetic zones must not leak into live mode");
});
