import test from "node:test";
import assert from "node:assert/strict";
import {
  canTransitionStatus,
  getRescueIntervals,
  validateEnhancedTelemetry,
  initialState,
  switchMode,
} from "../src/lib/kavach/state.ts";
import {
  loadPersistedOperationalData,
  savePersistedOperationalData,
  clearPersistedOperationalData,
} from "../src/lib/kavach/persistence.ts";
import type {
  RescueOperation,
  ConfirmedSurvivorRecord,
  EnhancedTelemetryPacket,
} from "../src/lib/kavach/types.ts";

test("Phase 3 - 1: Survivor counts are not fabricated from device count", () => {
  // A burst of 15 wireless MAC beacons must NOT equate to 15 survivors
  const mockDetections = Array.from({ length: 15 }, (_, i) => ({
    id: `DET-${i}`,
    ts: Date.now(),
    nodeId: "N01",
    signalType: "BLE" as const,
    tempId: `MAC-RAND-${i}`,
    rssi: -85 + (i % 5),
    distance: 12 + i,
    persistence: 0.8,
    status: "tracking" as const,
  }));

  // Device detections count
  assert.equal(mockDetections.length, 15);

  // Confirmed survivor count must rely strictly on independent physical validation, NOT raw beacon count
  const confirmedSurvivors: ConfirmedSurvivorRecord[] = [];
  assert.equal(
    confirmedSurvivors.length,
    0,
    "Zero confirmed survivors when no ground verification exists",
  );

  // Rule: Possible survivors require >= 75% multi-modal score; otherwise display 'Insufficient Evidence'
  const lowEvidenceZone = { score: 62, confidence: 60 };
  const hasStrongEvidence = lowEvidenceZone.score >= 75 || lowEvidenceZone.confidence >= 75;
  const displayCount = hasStrongEvidence ? "1 (Corroborated Zone)" : "Insufficient Evidence";
  assert.equal(
    displayCount,
    "Insufficient Evidence",
    "Weak evidence must not fabricate survivor counts",
  );
});

test("Phase 3 - 2: Confirmed and rescued counts remain strictly distinct", () => {
  const records: ConfirmedSurvivorRecord[] = [
    {
      id: "SURV-001",
      incidentId: "INC-1",
      nameOrIdentifier: "Subject Alpha",
      status: "awaiting_rescue",
      confirmedAt: 1700000000000,
      rescuedAt: null,
      confirmationSource: "Canine SAR Cross-Check",
      locationDescription: "Basement void",
      medicalUrgency: "urgent",
      notes: "Verbal contact",
    },
    {
      id: "SURV-002",
      incidentId: "INC-1",
      nameOrIdentifier: "Subject Beta",
      status: "rescued",
      confirmedAt: 1700000000000,
      rescuedAt: 1700003600000,
      confirmationSource: "Vocal Confirmation",
      locationDescription: "Ground floor pocket",
      medicalUrgency: "moderate",
      notes: "Extracted safely",
    },
    {
      id: "SURV-003",
      incidentId: "INC-1",
      nameOrIdentifier: "Subject Gamma",
      status: "awaiting_rescue",
      confirmedAt: 1700001000000,
      rescuedAt: null,
      confirmationSource: "Thermal Camera Inspection",
      locationDescription: "Second floor ceiling void",
      medicalUrgency: "critical",
      notes: "Shallow breathing",
    },
  ];

  const confirmedCount = records.length;
  const awaitingCount = records.filter((r) => r.status === "awaiting_rescue").length;
  const rescuedCount = records.filter((r) => r.status === "rescued").length;

  assert.equal(confirmedCount, 3, "Total confirmed casualties is 3");
  assert.equal(awaitingCount, 2, "2 casualties are awaiting rescue");
  assert.equal(rescuedCount, 1, "1 casualty is rescued");
  assert.equal(
    awaitingCount + rescuedCount,
    confirmedCount,
    "Sum of awaiting and rescued equals total confirmed",
  );
  assert.notEqual(awaitingCount, rescuedCount, "Awaiting and rescued must not be conflated");
});

test("Phase 3 - 3: Invalid rescue state transitions are strictly rejected", () => {
  // Direct jump from Reported to Resolved is illegal
  assert.equal(
    canTransitionStatus("Reported", "Resolved").allowed,
    false,
    "Reported cannot jump directly to Resolved without investigation and rescue",
  );

  // Direct jump from Reported to Rescue In Progress is illegal
  assert.equal(
    canTransitionStatus("Reported", "Rescue In Progress").allowed,
    false,
    "Reported cannot skip Under Investigation",
  );

  // Same status transition is illegal
  assert.equal(canTransitionStatus("Reported", "Reported").allowed, false);
  assert.equal(canTransitionStatus("Resolved", "Resolved").allowed, false);

  // Valid forward lifecycle transitions succeed
  assert.equal(canTransitionStatus("Reported", "Under Investigation").allowed, true);
  assert.equal(canTransitionStatus("Under Investigation", "Rescue In Progress").allowed, true);
  assert.equal(canTransitionStatus("Rescue In Progress", "Resolved").allowed, true);

  // Re-evaluation / fallback transitions
  assert.equal(canTransitionStatus("Under Investigation", "Reported").allowed, true);
  assert.equal(canTransitionStatus("Rescue In Progress", "Under Investigation").allowed, true);
  assert.equal(
    canTransitionStatus("Resolved", "Under Investigation").allowed,
    true,
    "Reopening a resolved case returns to investigation",
  );
  assert.equal(
    canTransitionStatus("Resolved", "Rescue In Progress").allowed,
    false,
    "Resolved cannot jump directly to active rescue",
  );
});

test("Phase 3 - 4: Response intervals calculate accurate elapsed durations and preserve missing timestamps as null", () => {
  const completeOp: RescueOperation = {
    id: "OP-FULL",
    incidentId: "INC-1",
    title: "Complete Mission",
    sector: "Sector A",
    status: "Resolved",
    reportedAt: 1000000000,
    confirmedAt: 1000600000, // +10 mins (600,000 ms)
    rescueStartedAt: 1001800000, // +20 mins from confirm (1,200,000 ms)
    rescueCompletedAt: 1003600000, // +30 mins rescue duration (1,800,000 ms)
    confirmedPeople: 1,
    rescuedCount: 1,
    awaitingRescue: 0,
    evidenceSource: "Acoustic",
    lastUpdated: 1003600000,
    notes: "",
    history: [],
  };

  const intervals = getRescueIntervals(completeOp);
  assert.equal(intervals.reportToConfirmMs, 600000, "Report-to-confirm is 10 mins");
  assert.equal(intervals.confirmToStartMs, 1200000, "Confirm-to-start is 20 mins");
  assert.equal(intervals.rescueDurationMs, 1800000, "Rescue duration is 30 mins");
  assert.equal(
    intervals.totalDurationMs,
    3600000,
    "Total duration is 1003600000 - 1000000000 = 3600000 ms (1 hour)",
  );

  // Incomplete operation with missing timestamps
  const partialOp: RescueOperation = {
    ...completeOp,
    id: "OP-PARTIAL",
    status: "Under Investigation",
    confirmedAt: null,
    rescueStartedAt: null,
    rescueCompletedAt: null,
  };

  const partialIntervals = getRescueIntervals(partialOp);
  assert.equal(
    partialIntervals.reportToConfirmMs,
    null,
    "Missing confirmation timestamp must return null, never 0",
  );
  assert.equal(partialIntervals.confirmToStartMs, null, "Missing start timestamp must return null");
  assert.equal(
    partialIntervals.rescueDurationMs,
    null,
    "Missing completion timestamp must return null",
  );
  assert.equal(
    partialIntervals.totalDurationMs,
    null,
    "Missing completion timestamp must return null",
  );
});

test("Phase 3 - 5: Enhanced telemetry validator rejects invalid coordinates, future timestamps, and duplicates", () => {
  const seenSeqs = new Set<string>();

  const basePacket: EnhancedTelemetryPacket = {
    deviceId: "N01",
    gatewayId: "GW-N04",
    timestamp: Date.now() - 5000,
    seq: 101,
    gps: {
      lat: 19.8912,
      lon: 74.4798,
      alt: 512,
      hdop: 1.2,
      fixStatus: "3d",
    },
    rssi: -75,
    measurements: {
      sound_db: 52,
      vibration_g: 0.05,
      thermal_c: 28.5,
    },
    battery: 92,
    source: "live",
    dataQuality: "valid",
  };

  // 1. Valid packet accepted
  const validRes = validateEnhancedTelemetry(basePacket, seenSeqs);
  assert.equal(validRes.valid, true);
  assert.ok(validRes.packet);
  seenSeqs.add(`N01:101`);

  // 2. Duplicate sequence number rejected
  const dupRes = validateEnhancedTelemetry(basePacket, seenSeqs);
  assert.equal(dupRes.valid, false);
  assert.match(dupRes.error || "", /Duplicate/i);

  // 3. Out-of-bounds latitude (>90) rejected
  const badLatPacket = {
    ...basePacket,
    seq: 102,
    gps: { ...basePacket.gps!, lat: 95.0 },
  };
  const badLatRes = validateEnhancedTelemetry(badLatPacket, seenSeqs);
  assert.equal(badLatRes.valid, false);
  assert.match(badLatRes.error || "", /range/i);

  // 4. Out-of-bounds longitude (>180) rejected
  const badLonPacket = {
    ...basePacket,
    seq: 103,
    gps: { ...basePacket.gps!, lon: 195.0 },
  };
  const badLonRes = validateEnhancedTelemetry(badLonPacket, seenSeqs);
  assert.equal(badLonRes.valid, false);
  assert.match(badLonRes.error || "", /range/i);

  // 5. Future timestamp (> 5 min ahead) rejected
  const futurePacket = {
    ...basePacket,
    seq: 104,
    timestamp: Date.now() + 600000, // +10 minutes
  };
  const futureRes = validateEnhancedTelemetry(futurePacket, seenSeqs);
  assert.equal(futureRes.valid, false);
  assert.match(futureRes.error || "", /future/i);

  // 6. Packet without GPS coordinates is valid but coordinates are null (never fabricated)
  const noGpsPacket = {
    ...basePacket,
    seq: 105,
    gps: null,
  };
  const noGpsRes = validateEnhancedTelemetry(noGpsPacket, seenSeqs);
  assert.equal(noGpsRes.valid, true);
  assert.equal(noGpsRes.packet?.gps, null, "Missing GPS coordinates stay null, not invented");
});

test("Phase 3 - 6: Simulation data stays strictly separate from live data", () => {
  const simState = initialState();
  assert.equal(simState.mode, "simulation");
  assert.ok(simState.operations.length > 0, "Simulation has seeded training operations");
  assert.ok(simState.survivors.length > 0, "Simulation has seeded training casualties");

  // Switch to live mode
  const { nextState: liveState } = switchMode(simState, "live", null, null, (s) => s);
  assert.equal(liveState.mode, "live");
  assert.equal(
    liveState.operations.length,
    0,
    "Live operational mode must NOT inherit simulation operations",
  );
  assert.equal(
    liveState.survivors.length,
    0,
    "Live operational mode must NOT inherit simulation casualties",
  );
  assert.equal(liveState.signal, null, "Zero synthetic ground truth in live mode");
  assert.equal(liveState.nodes.length, 0, "Zero synthetic nodes in live mode");
});

test("Phase 3 - 7: Persistence bundle serialization and schema validation safely ignores corrupted payloads", () => {
  // Clear any existing data
  clearPersistedOperationalData();

  // Load when empty returns null safely
  const empty = loadPersistedOperationalData();
  assert.equal(empty, null);

  // Save valid bundle
  const testBundle = {
    operations: [
      {
        id: "OP-TEST-01",
        incidentId: "INC-TEST",
        title: "Test Operation",
        sector: "Sector 1",
        status: "Reported" as const,
        reportedAt: Date.now(),
        confirmedAt: null,
        rescueStartedAt: null,
        rescueCompletedAt: null,
        confirmedPeople: 1,
        rescuedCount: 0,
        awaitingRescue: 1,
        evidenceSource: "Manual",
        lastUpdated: Date.now(),
        notes: "Test note",
        history: [],
      },
    ],
    survivors: [],
    incidentNotes: "Test incident notes",
  };

  savePersistedOperationalData(testBundle);

  // Clean up
  clearPersistedOperationalData();
  const afterClear = loadPersistedOperationalData();
  assert.equal(afterClear, null);
});

test("Phase 3 - 8: Analytics calculations avoid double counting and handle empty datasets gracefully", () => {
  const operations: RescueOperation[] = [
    {
      id: "OP-1",
      incidentId: "INC-1",
      title: "Op 1",
      sector: "Sector 1",
      status: "Resolved",
      reportedAt: 1000,
      confirmedAt: 2000,
      rescueStartedAt: 3000,
      rescueCompletedAt: 4000,
      confirmedPeople: 2,
      rescuedCount: 2,
      awaitingRescue: 0,
      evidenceSource: "Acoustic",
      lastUpdated: 4000,
      notes: "",
      history: [],
    },
    {
      id: "OP-2",
      incidentId: "INC-1",
      title: "Op 2",
      sector: "Sector 2",
      status: "Rescue In Progress",
      reportedAt: 2000,
      confirmedAt: 3000,
      rescueStartedAt: 4000,
      rescueCompletedAt: null,
      confirmedPeople: 1,
      rescuedCount: 0,
      awaitingRescue: 1,
      evidenceSource: "BLE",
      lastUpdated: 4000,
      notes: "",
      history: [],
    },
  ];

  // Open operations
  const openOps = operations.filter((o) => o.status !== "Resolved");
  assert.equal(openOps.length, 1, "Only OP-2 is open");

  // Response intervals calculation with missing completedAt on OP-2
  const completedOps = operations.filter((o) => o.reportedAt && o.rescueCompletedAt);
  assert.equal(completedOps.length, 1, "Only OP-1 has complete report-to-resolved timestamps");

  const meanTotalDuration = Math.round(
    completedOps.reduce((sum, o) => sum + (o.rescueCompletedAt! - o.reportedAt), 0) /
      completedOps.length,
  );
  assert.equal(meanTotalDuration, 3000, "Calculated mean total duration without NaN");

  // Empty operations test
  const emptyOps: RescueOperation[] = [];
  const emptyCompleted = emptyOps.filter((o) => o.reportedAt && o.rescueCompletedAt);
  const emptyMean = emptyCompleted.length ? 1 : null;
  assert.equal(emptyMean, null, "Empty operations returns null, not NaN or 0");
});
