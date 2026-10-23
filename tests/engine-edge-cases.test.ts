import test from "node:test";
import assert from "node:assert/strict";
import {
  localize,
  localizeWithDiagnostics,
  rssiToDistance,
  distanceToRssi,
  metresBetween,
  offsetMetres,
  buildEvidence,
  scoreEvidence,
  priorityOf,
  type LocalizationInput,
} from "../src/lib/kavach/engine.ts";
import type { CalibrationSettings } from "../src/lib/kavach/types.ts";

const CAL: CalibrationSettings = {
  refRssi: -48,
  pathLossExponent: 2.7,
  minRadius: 8,
  maxRadius: 120,
};

test("P5 Edge Case 1: Fewer than three unique sensor nodes", () => {
  assert.equal(localize([], CAL), null);
  const oneNode: LocalizationInput[] = [{ nodeId: "N01", lat: 19.87, lon: 74.47, rssi: -70 }];
  assert.equal(localize(oneNode, CAL), null);
  const twoNodes: LocalizationInput[] = [
    { nodeId: "N01", lat: 19.87, lon: 74.47, rssi: -70 },
    { nodeId: "N02", lat: 19.88, lon: 74.48, rssi: -75 },
  ];
  assert.equal(localize(twoNodes, CAL), null);
  const duplicateId: LocalizationInput[] = [
    { nodeId: "N01", lat: 19.87, lon: 74.47, rssi: -70 },
    { nodeId: "N01", lat: 19.88, lon: 74.48, rssi: -75 },
    { nodeId: "N01", lat: 19.89, lon: 74.49, rssi: -80 },
  ];
  assert.equal(localize(duplicateId, CAL), null);
});

test("P5 Edge Case 2: Exactly three usable nodes", () => {
  const threeNodes: LocalizationInput[] = [
    { nodeId: "N01", lat: 19.8762, lon: 74.4785, rssi: -65 },
    { nodeId: "N02", lat: 19.8775, lon: 74.4805, rssi: -72 },
    { nodeId: "N03", lat: 19.875, lon: 74.481, rssi: -68 },
  ];
  const res = localize(threeNodes, CAL);
  assert.ok(res !== null, "Result should not be null for 3 valid nodes");
  assert.equal(res.nodes.length, 3);
  assert.ok(Number.isFinite(res.lat));
  assert.ok(Number.isFinite(res.lon));
  assert.ok(Number.isFinite(res.radius));
  assert.ok(res.radius >= CAL.minRadius && res.radius <= CAL.maxRadius);
  assert.ok(Number.isFinite(res.confidence));
  assert.ok(res.confidence >= 5 && res.confidence <= 90);
  assert.ok(Number.isFinite(res.residual));
  assert.ok(res.residual >= 0);
});

test("P5 Edge Case 3: Collinear node positions", () => {
  // Three nodes placed in a straight line along the same meridian
  const collinearNodes: LocalizationInput[] = [
    { nodeId: "N01", lat: 19.87, lon: 74.4785, rssi: -70 },
    { nodeId: "N02", lat: 19.875, lon: 74.4785, rssi: -65 },
    { nodeId: "N03", lat: 19.88, lon: 74.4785, rssi: -75 },
  ];
  const diag = localizeWithDiagnostics(collinearNodes, CAL);
  assert.equal(diag.result, null, "Collinear nodes should not emit a false 2D fix");
  assert.equal(diag.reason, "collinear_geometry");
});

test("P5 Edge Case 4: Duplicate node coordinates", () => {
  // Three nodes with distinct IDs but identical coordinates
  const duplicateCoords: LocalizationInput[] = [
    { nodeId: "N01", lat: 19.8762, lon: 74.4785, rssi: -70 },
    { nodeId: "N02", lat: 19.8762, lon: 74.4785, rssi: -72 },
    { nodeId: "N03", lat: 19.8762, lon: 74.4785, rssi: -68 },
  ];
  const diag = localizeWithDiagnostics(duplicateCoords, CAL);
  assert.equal(diag.result, null, "Collocated nodes cannot trilaterate in 2D");
  assert.equal(diag.reason, "duplicate_coordinates");
});

test("P5 Edge Case 5: Missing or non-finite RSSI values", () => {
  const missingRssi: LocalizationInput[] = [
    { nodeId: "N01", lat: 19.8762, lon: 74.4785, rssi: -65 },
    { nodeId: "N02", lat: 19.8775, lon: 74.4805, rssi: Number.NaN },
    { nodeId: "N03", lat: 19.875, lon: 74.481, rssi: -70 },
  ];
  const diag = localizeWithDiagnostics(missingRssi, CAL);
  assert.equal(diag.result, null);
  assert.equal(diag.reason, "insufficient_nodes");
});

test("P5 Edge Case 6: Invalid or non-finite coordinates", () => {
  const invalidCoords: LocalizationInput[] = [
    { nodeId: "N01", lat: Number.NaN, lon: 74.4785, rssi: -65 },
    { nodeId: "N02", lat: 19.8775, lon: Number.POSITIVE_INFINITY, rssi: -70 },
    { nodeId: "N03", lat: 19.875, lon: 74.481, rssi: -70 },
  ];
  const diag = localizeWithDiagnostics(invalidCoords, CAL);
  assert.equal(diag.result, null);
  assert.ok(
    diag.reason === "insufficient_nodes" || diag.reason === "stale_or_invalid",
    `Expected failure reason, got ${diag.reason}`,
  );
});

test("P5 Edge Case 7: Stale observations (> 60s)", () => {
  const staleObs: LocalizationInput[] = [
    { nodeId: "N01", lat: 19.8762, lon: 74.4785, rssi: -65, age: 0 },
    { nodeId: "N02", lat: 19.8775, lon: 74.4805, rssi: -70, age: 30 },
    { nodeId: "N03", lat: 19.875, lon: 74.481, rssi: -75, age: 65 }, // stale
  ];
  const diag = localizeWithDiagnostics(staleObs, CAL);
  assert.equal(diag.result, null);
  assert.equal(diag.reason, "insufficient_nodes");
});

test("P5 Edge Case 8: Extremely noisy RSSI measurements", () => {
  const noisyObs: LocalizationInput[] = [
    { nodeId: "N01", lat: 19.8762, lon: 74.4785, rssi: -125, variance: 80 },
    { nodeId: "N02", lat: 19.8775, lon: 74.4805, rssi: -110, variance: 95 },
    { nodeId: "N03", lat: 19.875, lon: 74.481, rssi: -130, variance: 60 },
  ];
  const res = localize(noisyObs, CAL);
  assert.ok(res !== null);
  assert.ok(Number.isFinite(res.lat));
  assert.ok(Number.isFinite(res.lon));
  assert.ok(Number.isFinite(res.radius));
  // Under extreme noise, radius should expand towards maxRadius
  assert.ok(res.radius > 20);
  // Confidence should reflect high uncertainty
  assert.ok(res.confidence < 70);
});

test("P5 Edge Case 9: Empty observation arrays", () => {
  assert.equal(localize([], CAL), null);
  assert.equal(localizeWithDiagnostics([], CAL).result, null);
  assert.equal(localizeWithDiagnostics([], CAL).usableObservations, 0);
});

test("P5 Edge Case 10: NaN and Infinity prevention across all math helpers", () => {
  // rssiToDistance
  assert.ok(Number.isFinite(rssiToDistance(Number.NaN, CAL)));
  assert.ok(Number.isFinite(rssiToDistance(Number.POSITIVE_INFINITY, CAL)));
  assert.ok(Number.isFinite(rssiToDistance(-200, { ...CAL, pathLossExponent: 0 })));
  assert.ok(Number.isFinite(rssiToDistance(-50, { ...CAL, pathLossExponent: Number.NaN })));

  // distanceToRssi
  assert.ok(Number.isFinite(distanceToRssi(Number.NaN, CAL)));
  assert.ok(Number.isFinite(distanceToRssi(-10, CAL)));
  assert.ok(Number.isFinite(distanceToRssi(Number.POSITIVE_INFINITY, CAL)));

  // metresBetween
  assert.ok(Number.isFinite(metresBetween({ lat: Number.NaN, lon: 0 }, { lat: 0, lon: 0 })));
  assert.ok(
    Number.isFinite(metresBetween({ lat: 0, lon: Number.POSITIVE_INFINITY }, { lat: 0, lon: 0 })),
  );

  // offsetMetres
  const off = offsetMetres({ lat: Number.NaN, lon: 74.4785 }, Number.POSITIVE_INFINITY, 50);
  assert.ok(Number.isFinite(off.lat));
  assert.ok(Number.isFinite(off.lon));

  // scoreEvidence
  const badEvidence = {
    wirelessPersistence: Number.NaN,
    rssiStrength: Number.POSITIVE_INFINITY,
    sound: -10,
    vibration: Number.NaN,
    thermal: 2.5,
  };
  const score = scoreEvidence(badEvidence);
  assert.ok(Number.isFinite(score));
  assert.ok(score >= 0 && score <= 99);
});

test("P5 Edge Case 11: Invalid confidence-radius calculations stay strictly bounded", () => {
  const extremeObs: LocalizationInput[] = [
    { nodeId: "N01", lat: 19.8762, lon: 74.4785, rssi: -30, variance: 0, age: 0 },
    { nodeId: "N02", lat: 19.8775, lon: 74.4805, rssi: -35, variance: 0, age: 0 },
    { nodeId: "N03", lat: 19.875, lon: 74.481, rssi: -32, variance: 0, age: 0 },
  ];
  const res = localize(extremeObs, CAL);
  assert.ok(res !== null);
  assert.ok(
    res.radius >= CAL.minRadius,
    `Radius ${res.radius} must be >= minRadius ${CAL.minRadius}`,
  );
  assert.ok(
    res.radius <= CAL.maxRadius,
    `Radius ${res.radius} must be <= maxRadius ${CAL.maxRadius}`,
  );
  assert.ok(res.confidence >= 5 && res.confidence <= 90);
});

test("P5 Edge Case 12: Poor geometric coverage penalty", () => {
  // Good triangular geometry
  const goodGeometry: LocalizationInput[] = [
    { nodeId: "N01", lat: 19.87, lon: 74.47, rssi: -65 },
    { nodeId: "N02", lat: 19.885, lon: 74.47, rssi: -65 },
    { nodeId: "N03", lat: 19.878, lon: 74.485, rssi: -65 },
  ];
  // Narrow, squished angular baseline (nearly collinear)
  const narrowGeometry: LocalizationInput[] = [
    { nodeId: "N01", lat: 19.87, lon: 74.478, rssi: -65 },
    { nodeId: "N02", lat: 19.878, lon: 74.4782, rssi: -65 },
    { nodeId: "N03", lat: 19.886, lon: 74.4788, rssi: -65 },
  ];
  const goodRes = localize(goodGeometry, CAL);
  const narrowRes = localize(narrowGeometry, CAL);
  assert.ok(goodRes !== null);
  if (narrowRes !== null) {
    assert.ok(
      narrowRes.radius > goodRes.radius,
      "Narrow geometry must have higher uncertainty radius than well-spread geometry",
    );
    assert.ok(
      narrowRes.confidence < goodRes.confidence,
      "Narrow geometry must have lower confidence than well-spread geometry",
    );
  }
});

test("P5 Edge Case 13: Deterministic consistency for identical inputs", () => {
  const obs: LocalizationInput[] = [
    { nodeId: "N01", lat: 19.8762, lon: 74.4785, rssi: -68 },
    { nodeId: "N02", lat: 19.8775, lon: 74.4805, rssi: -72 },
    { nodeId: "N03", lat: 19.875, lon: 74.481, rssi: -70 },
  ];
  const res1 = localize(obs, CAL);
  const res2 = localize(obs, CAL);
  assert.deepEqual(
    res1,
    res2,
    "Repeated calls with identical inputs must produce identical results",
  );
});

test("P5 Edge Case 14: Sensor fusion scoring false-positive suppression", () => {
  // Strong, consistent multi-sensor evidence
  const strongEvidence = {
    wirelessPersistence: 0.9,
    rssiStrength: 0.85,
    sound: 0.8,
    vibration: 0.75,
    thermal: 0.8,
  };
  const strongScore = scoreEvidence(strongEvidence);
  assert.ok(strongScore >= 68);
  assert.equal(priorityOf(strongScore), "HIGH");

  // Inconsistent / scattered evidence (high sound, but zero wireless and zero thermal)
  const falsePositive = {
    wirelessPersistence: 0.05,
    rssiStrength: 0.1,
    sound: 0.95, // loud bang or noise artifact
    vibration: 0.1,
    thermal: 0.05,
  };
  const fpScore = scoreEvidence(falsePositive);
  assert.ok(
    fpScore < 40,
    `False positive noise anomaly score (${fpScore}) must be penalized below 40`,
  );
  assert.equal(priorityOf(fpScore), "LOW");
});

test("P5 Edge Case 15: buildEvidence handles empty and degraded nodes safely", () => {
  const empty = buildEvidence([], 0.5);
  assert.equal(empty.wirelessPersistence, 0);
  assert.equal(empty.rssiStrength, 0);
  assert.equal(empty.sound, 0);

  const offlineNodes = [
    {
      id: "N01",
      label: "Node 1",
      lat: 19.87,
      lon: 74.47,
      status: "offline" as const,
      battery: 0,
      sound: 50,
      vibration: 0.1,
      temperature: 30,
      bleDetected: 0,
      wifiDetected: 0,
      rssi: -80,
      loraRssi: -90,
      loraSnr: 5,
      lastPacket: 0,
      sensorHealth: {},
      hops: 1,
    },
  ];
  const result = buildEvidence(offlineNodes, 0.8);
  assert.equal(result.wirelessPersistence, 0);
  assert.equal(result.rssiStrength, 0);
});
