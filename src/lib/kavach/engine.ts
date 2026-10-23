import type {
  CalibrationSettings,
  EstimationPipelineReport,
  EvidenceBreakdown,
  NodeId,
  Priority,
  RejectedObservationInfo,
  SensorNode,
} from "./types";

/* ------------------------------------------------------------------ */
/* Deterministic pseudo random (seeded) so demos are reproducible      */
/* ------------------------------------------------------------------ */
export function makeRng(seed: number) {
  let s = (Number.isFinite(seed) ? seed : 20261012) >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

export const clamp = (v: number, lo: number, hi: number) => {
  if (!Number.isFinite(v)) return lo;
  return Math.min(hi, Math.max(lo, v));
};

/* ------------------------------------------------------------------ */
/* Geo helpers (local flat-earth approximation, fine at this scale)    */
/* ------------------------------------------------------------------ */
export const M_PER_DEG_LAT = 111_320;
export const mPerDegLon = (lat: number) => {
  if (!Number.isFinite(lat)) return 111_320;
  const rad = (lat * Math.PI) / 180;
  return 111_320 * Math.max(0.001, Math.cos(rad));
};

export function metresBetween(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  if (
    !a ||
    !b ||
    !Number.isFinite(a.lat) ||
    !Number.isFinite(a.lon) ||
    !Number.isFinite(b.lat) ||
    !Number.isFinite(b.lon)
  ) {
    return 0;
  }
  const dy = (a.lat - b.lat) * M_PER_DEG_LAT;
  const dx = (a.lon - b.lon) * mPerDegLon(a.lat);
  const dist = Math.hypot(dx, dy);
  return Number.isFinite(dist) ? dist : 0;
}

export function offsetMetres(origin: { lat: number; lon: number }, east: number, north: number) {
  const lat = Number.isFinite(origin?.lat) ? origin.lat : 0;
  const lon = Number.isFinite(origin?.lon) ? origin.lon : 0;
  const e = Number.isFinite(east) ? east : 0;
  const n = Number.isFinite(north) ? north : 0;
  const dLat = n / M_PER_DEG_LAT;
  const degLonScale = Math.max(1e-4, mPerDegLon(lat));
  const dLon = e / degLonScale;
  return {
    lat: lat + (Number.isFinite(dLat) ? dLat : 0),
    lon: lon + (Number.isFinite(dLon) ? dLon : 0),
  };
}

/* ------------------------------------------------------------------ */
/* Log-distance path-loss model: d = 10 ^ ((RSSI_ref - RSSI) / (10n))   */
/* ------------------------------------------------------------------ */
export function rssiToDistance(rssi: number, cal: CalibrationSettings) {
  if (!Number.isFinite(rssi)) return 500;
  const n =
    Number.isFinite(cal?.pathLossExponent) && cal.pathLossExponent > 0 ? cal.pathLossExponent : 2.7;
  const ref = Number.isFinite(cal?.refRssi) ? cal.refRssi : -48;
  const exponent = (ref - rssi) / (10 * n);
  if (!Number.isFinite(exponent)) return 500;
  const d = Math.pow(10, exponent);
  return clamp(Number.isFinite(d) ? d : 500, 0.5, 500);
}

export function distanceToRssi(distance: number, cal: CalibrationSettings) {
  const d = Number.isFinite(distance) ? Math.max(0.5, distance) : 0.5;
  const n =
    Number.isFinite(cal?.pathLossExponent) && cal.pathLossExponent > 0 ? cal.pathLossExponent : 2.7;
  const ref = Number.isFinite(cal?.refRssi) ? cal.refRssi : -48;
  const val = ref - 10 * n * Math.log10(d);
  return Number.isFinite(val) ? val : ref;
}

/* ------------------------------------------------------------------ */
/* RF Log-Distance Path-Loss Regression Calibration Solver            */
/* Model: RSSI(d) = A0 - 10 * n * log10(d / d0) + error               */
/* ------------------------------------------------------------------ */
export interface CalibrationSample {
  id: string;
  distance: number; // reference distance in meters (d > 0)
  rssi: number; // observed RSSI in dBm
  source: "live" | "manual" | "simulation";
  timestamp: number;
  notes?: string;
}

export interface CalibrationFitResult {
  a0: number; // Fitted RSSI at d0 (1.0 m)
  pathLossExponent: number; // n
  rmse: number;
  r2: number;
  sampleCount: number;
  distinctDistances: number;
  residuals: { distance: number; rssi: number; predictedRssi: number; error: number }[];
  warnings: string[];
  isReliable: boolean;
}

export function fitLogDistanceModel(samples: CalibrationSample[], d0 = 1.0): CalibrationFitResult {
  const valid = (samples || []).filter(
    (s) =>
      typeof s.distance === "number" &&
      Number.isFinite(s.distance) &&
      s.distance > 0 &&
      typeof s.rssi === "number" &&
      Number.isFinite(s.rssi) &&
      s.rssi > -150 &&
      s.rssi < 20,
  );

  const warnings: string[] = [];
  const distinctDists = new Set(valid.map((s) => Math.round(s.distance * 10) / 10)).size;

  if (valid.length < 3) {
    warnings.push("Insufficient samples (minimum 3 required for regression fit).");
  }
  if (distinctDists < 2) {
    warnings.push(
      "Insufficient distinct reference distances (minimum 2 different distances required).",
    );
  }

  if (valid.length < 3 || distinctDists < 2) {
    return {
      a0: -48.0,
      pathLossExponent: 2.7,
      rmse: 0,
      r2: 0,
      sampleCount: valid.length,
      distinctDistances: distinctDists,
      residuals: [],
      warnings,
      isReliable: false,
    };
  }

  // Model: RSSI(d) = A0 - 10 * n * log10(d / d0)
  // Let x_i = 10 * log10(d_i / d0), y_i = RSSI_i
  // y_i = A0 + beta * x_i  where beta = -n
  const N = valid.length;
  let sumX = 0;
  let sumY = 0;
  const xyPairs = valid.map((s) => {
    const x = 10 * Math.log10(s.distance / d0);
    const y = s.rssi;
    sumX += x;
    sumY += y;
    return { s, x, y };
  });

  const meanX = sumX / N;
  const meanY = sumY / N;

  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  xyPairs.forEach(({ x, y }) => {
    const dx = x - meanX;
    const dy = y - meanY;
    sxx += dx * dx;
    sxy += dx * dy;
    syy += dy * dy;
  });

  if (Math.abs(sxx) < 1e-6) {
    warnings.push(
      "Degenerate distance variance (samples are all at approximately the same distance).",
    );
    return {
      a0: meanY,
      pathLossExponent: 2.7,
      rmse: 0,
      r2: 0,
      sampleCount: N,
      distinctDistances: distinctDists,
      residuals: [],
      warnings,
      isReliable: false,
    };
  }

  const beta = sxy / sxx;
  const n = -beta;
  const a0 = meanY - beta * meanX;

  // Physical bounds check: RF path loss exponent typically in [1.5, 5.0]
  if (n < 1.4) {
    warnings.push(
      `Fitted exponent n = ${n.toFixed(2)} is unusually low for terrestrial RF (expected 1.6–4.5).`,
    );
  } else if (n > 4.8) {
    warnings.push(
      `Fitted exponent n = ${n.toFixed(2)} indicates extreme structural obstruction or non-line-of-sight.`,
    );
  }

  // Compute residuals and RMSE
  let sumSqErr = 0;
  const residuals = valid.map((s) => {
    const predictedRssi = a0 - 10 * n * Math.log10(s.distance / d0);
    const error = s.rssi - predictedRssi;
    sumSqErr += error * error;
    return {
      distance: s.distance,
      rssi: s.rssi,
      predictedRssi,
      error,
    };
  });

  const rmse = Math.sqrt(sumSqErr / N);
  const r2 = syy > 1e-6 ? Math.max(0, 1 - sumSqErr / syy) : 0;

  if (r2 < 0.6) {
    warnings.push(
      `Low coefficient of determination (R² = ${r2.toFixed(2)}). High RSSI variance detected.`,
    );
  }
  if (rmse > 8.0) {
    warnings.push(
      `High root-mean-square error (RMSE = ${rmse.toFixed(1)} dB). Distance estimates will have wide uncertainty.`,
    );
  }

  return {
    a0,
    pathLossExponent: n,
    rmse,
    r2,
    sampleCount: N,
    distinctDistances: distinctDists,
    residuals,
    warnings,
    isReliable: n >= 1.4 && n <= 4.8 && r2 >= 0.6 && rmse <= 8.0 && warnings.length === 0,
  };
}

export interface LocalizationInput {
  nodeId: NodeId;
  lat: number;
  lon: number;
  rssi: number;
  age?: number;
  variance?: number;
}

export interface LocalizationResult {
  lat: number;
  lon: number;
  radius: number;
  residual: number;
  nodes: NodeId[];
  confidence: number;
}

export const ESTIMATOR_VERSION = "TRACE-EST-V6.1-GDOP";

export type LocalizationFailureReason =
  | "insufficient_nodes"
  | "duplicate_coordinates"
  | "collinear_geometry"
  | "stale_or_invalid"
  | "high_residual"
  | "calculation_error";

export interface LocalizationDiagnostics {
  result: LocalizationResult | null;
  reason?: LocalizationFailureReason;
  message?: string;
  usableObservations: number;
  totalObservations: number;
  rejectedObservations: RejectedObservationInfo[];
  geometryScore?: number;
  gdop?: number;
  warnings: string[];
}

/**
 * Weighted multilateration by coarse-to-fine grid search on the
 * least-squares residual of (measured range - geometric range).
 * Stronger RSSI observations get more weight. Returns a probable
 * search ZONE (centre + confidence radius) with diagnostics, never an exact fix.
 */
export function localizeWithDiagnostics(
  observations: LocalizationInput[],
  cal: CalibrationSettings,
): LocalizationDiagnostics {
  const totalObs = Array.isArray(observations) ? observations.length : 0;
  if (!Array.isArray(observations) || observations.length === 0) {
    return {
      result: null,
      reason: "insufficient_nodes",
      message: "No observations provided",
      usableObservations: 0,
      totalObservations: 0,
      rejectedObservations: [],
      warnings: ["No observation packets received by the multilateration solver."],
    };
  }

  // Sanitize and validate calibration
  const safeCal: CalibrationSettings = {
    refRssi: Number.isFinite(cal?.refRssi) ? cal.refRssi : -48,
    pathLossExponent:
      Number.isFinite(cal?.pathLossExponent) && cal.pathLossExponent > 0
        ? cal.pathLossExponent
        : 2.7,
    minRadius: Number.isFinite(cal?.minRadius) && cal.minRadius > 0 ? cal.minRadius : 8,
    maxRadius: Number.isFinite(cal?.maxRadius) && cal.maxRadius > 0 ? cal.maxRadius : 120,
  };
  if (safeCal.maxRadius < safeCal.minRadius) {
    safeCal.maxRadius = safeCal.minRadius;
  }

  // Filter valid observations while tracking rejected observations and their reasons
  const rejectedObservations: RejectedObservationInfo[] = [];
  const validObs: LocalizationInput[] = [];

  for (const o of observations) {
    if (!o || typeof o.nodeId !== "string" || o.nodeId.trim().length === 0) {
      rejectedObservations.push({
        nodeId: o?.nodeId ?? "UNKNOWN",
        reason: "Missing or invalid node identifier",
        rssi: o?.rssi,
        age: o?.age,
      });
      continue;
    }
    if (
      !Number.isFinite(o.lat) ||
      Math.abs(o.lat) > 90 ||
      !Number.isFinite(o.lon) ||
      Math.abs(o.lon) > 180
    ) {
      rejectedObservations.push({
        nodeId: o.nodeId,
        reason: "Invalid or non-finite geographic coordinates",
        rssi: o.rssi,
        age: o.age,
      });
      continue;
    }
    if (!Number.isFinite(o.rssi)) {
      rejectedObservations.push({
        nodeId: o.nodeId,
        reason: "Missing or non-finite RSSI measurement",
        rssi: o.rssi,
        age: o.age,
      });
      continue;
    }
    if (o.rssi < -150 || o.rssi > 20) {
      rejectedObservations.push({
        nodeId: o.nodeId,
        reason: `RSSI ${o.rssi} dBm out of physical bounds (-150 to +20 dBm)`,
        rssi: o.rssi,
        age: o.age,
      });
      continue;
    }
    if (!Number.isFinite(o.age ?? 0) || (o.age ?? 0) < 0 || (o.age ?? 0) >= 60) {
      rejectedObservations.push({
        nodeId: o.nodeId,
        reason: `Observation stale (age ${(o.age ?? 0).toFixed(1)}s >= 60s limit)`,
        rssi: o.rssi,
        age: o.age,
      });
      continue;
    }
    validObs.push(o);
  }

  if (validObs.length < 3) {
    return {
      result: null,
      reason: validObs.length === 0 ? "stale_or_invalid" : "insufficient_nodes",
      message: `Only ${validObs.length} valid observation(s) available; minimum 3 required`,
      usableObservations: validObs.length,
      totalObservations: totalObs,
      rejectedObservations,
      warnings: [
        validObs.length === 0
          ? "All input observations were filtered out due to staleness or invalid values."
          : `Trilateration requires ≥3 reporting stations; only ${validObs.length} station(s) passed validation.`,
      ],
    };
  }

  const uniqueNodes = new Set(validObs.map((o) => o.nodeId));
  if (uniqueNodes.size < 3) {
    return {
      result: null,
      reason: "insufficient_nodes",
      message: `Observations come from only ${uniqueNodes.size} unique node(s); minimum 3 required`,
      usableObservations: validObs.length,
      totalObservations: totalObs,
      rejectedObservations,
      warnings: [
        `Observations originate from only ${uniqueNodes.size} distinct node(s). Multi-packet bursts from single nodes do not provide geometric diversity.`,
      ],
    };
  }

  // Check for duplicate / collocated node coordinates
  // Nodes within identical 5-decimal place coordinates are collocated
  const uniquePositions = new Set(
    validObs.map(
      (o) =>
        `${(Math.round(o.lat * 1e5) / 1e5).toFixed(5)},${(Math.round(o.lon * 1e5) / 1e5).toFixed(5)}`,
    ),
  );
  if (uniquePositions.size < 3) {
    return {
      result: null,
      reason: "duplicate_coordinates",
      message: `Sensors occupy only ${uniquePositions.size} distinct location(s); 2D trilateration requires ≥3 spatially distinct anchors`,
      usableObservations: validObs.length,
      totalObservations: totalObs,
      rejectedObservations,
      warnings: ["Collocated sensor nodes cannot form a 2D baseline for trilateration."],
    };
  }

  const ranges = validObs.map((o) => {
    const variance = Number.isFinite(o.variance) && (o.variance ?? 0) >= 0 ? (o.variance ?? 0) : 0;
    const age = Number.isFinite(o.age) && (o.age ?? 0) >= 0 ? (o.age ?? 0) : 0;
    const d = rssiToDistance(o.rssi, safeCal);
    const w = clamp((o.rssi + 120) / 80, 0.15, 1) / (1 + variance / 9 + age / 15);
    return {
      ...o,
      d,
      w: Number.isFinite(w) && w > 0 ? w : 0.15,
      variance,
      age,
    };
  });

  const lat0 = ranges.reduce((s, r) => s + r.lat, 0) / ranges.length;
  const lon0 = ranges.reduce((s, r) => s + r.lon, 0) / ranges.length;

  // Geometry dilution of precision / collinearity check
  const xs = validObs.map((o) => (o.lon - lon0) * mPerDegLon(lat0));
  const ys = validObs.map((o) => (o.lat - lat0) * M_PER_DEG_LAT);
  const xx = xs.reduce((s, x) => s + x * x, 0);
  const yy = ys.reduce((s, y) => s + y * y, 0);
  const xy = xs.reduce((s, x, i) => s + x * (ys[i] ?? 0), 0);
  const denom = Math.max(1, (xx + yy) ** 2);
  const det = xx * yy - xy * xy;
  const geometry = clamp((4 * Math.max(0, det)) / denom, 0, 1);
  const gdop = clamp(1 / Math.sqrt(Math.max(0.001, geometry)), 1.0, 20.0);

  if (geometry < 0.05) {
    return {
      result: null,
      reason: "collinear_geometry",
      message: `Node geometry is collinear (coverage metric ${geometry.toFixed(2)}); spatial ambiguity prevents 2D localization`,
      usableObservations: validObs.length,
      totalObservations: totalObs,
      rejectedObservations,
      geometryScore: geometry,
      gdop,
      warnings: [
        `Node geometry is collinear (coverage ${geometry.toFixed(2)}, GDOP ${gdop.toFixed(1)}). Stations form a line, creating mirror-point ambiguity.`,
      ],
    };
  }

  const cost = (lat: number, lon: number) => {
    let sum = 0;
    let wsum = 0;
    for (const r of ranges) {
      const g = metresBetween({ lat, lon }, { lat: r.lat, lon: r.lon });
      sum += r.w * (g - r.d) ** 2;
      wsum += r.w;
    }
    return Math.sqrt(sum / Math.max(1e-6, wsum));
  };

  let best = { lat: lat0, lon: lon0, cost: cost(lat0, lon0) };
  let span = 260; // metres
  for (let pass = 0; pass < 5; pass++) {
    const step = span / 8;
    const centre = { ...best };
    for (let iy = -8; iy <= 8; iy++) {
      for (let ix = -8; ix <= 8; ix++) {
        const p = offsetMetres(centre, ix * step, iy * step);
        const c = cost(p.lat, p.lon);
        if (Number.isFinite(c) && c < best.cost) best = { lat: p.lat, lon: p.lon, cost: c };
      }
    }
    span = span / 3;
  }

  const uncertainty =
    validObs.reduce((s, o) => s + Math.sqrt(Math.max(0, o.variance ?? 0)) * 2 + (o.age ?? 0), 0) /
    validObs.length;
  const geometryPenalty = 1 + (1 - geometry) * 2 + Math.max(0, 4 - validObs.length) * 0.15;
  const radius = clamp(
    (8 + best.cost * 1.4 + uncertainty) * geometryPenalty,
    safeCal.minRadius,
    safeCal.maxRadius,
  );
  const confidence = Math.round(
    clamp(90 - best.cost * 0.7 - uncertainty - (1 - geometry) * 35, 5, 90),
  );

  const warnings: string[] = [];
  if (gdop > 3.0) {
    warnings.push(
      `Elevated Geometric Dilution of Precision (GDOP ${gdop.toFixed(2)}): Sensor angles create directional uncertainty.`,
    );
  }
  if (uncertainty > 15) {
    warnings.push("High measurement variance or observation latency across reporting stations.");
  }
  if (best.cost > 25) {
    warnings.push(
      `High residual fit error (${best.cost.toFixed(1)} m): RF multipath or structural obstruction observed.`,
    );
  }

  if (
    !Number.isFinite(best.lat) ||
    !Number.isFinite(best.lon) ||
    !Number.isFinite(radius) ||
    !Number.isFinite(best.cost) ||
    !Number.isFinite(confidence)
  ) {
    return {
      result: null,
      reason: "calculation_error",
      message: "Non-finite values encountered during multilateration grid search",
      usableObservations: validObs.length,
      totalObservations: totalObs,
      rejectedObservations,
      warnings: ["Non-finite coordinate output prevented position generation."],
    };
  }

  return {
    result: {
      lat: best.lat,
      lon: best.lon,
      radius,
      residual: best.cost,
      nodes: validObs.map((o) => o.nodeId),
      confidence,
    },
    usableObservations: validObs.length,
    totalObservations: totalObs,
    rejectedObservations,
    geometryScore: geometry,
    gdop,
    warnings,
  };
}

/**
 * Standard localization entry point, returning LocalizationResult or null.
 */
export function localize(
  observations: LocalizationInput[],
  cal: CalibrationSettings,
): LocalizationResult | null {
  return localizeWithDiagnostics(observations, cal).result;
}

/**
 * End-to-end transparent estimation pipeline runner.
 */
export function runEstimationPipeline(
  observations: LocalizationInput[],
  cal: CalibrationSettings,
  sourceMode: "simulation" | "live" = "simulation",
): EstimationPipelineReport {
  const diag = localizeWithDiagnostics(observations, cal);
  let eligibilityStatus: EstimationPipelineReport["eligibilityStatus"] = "eligible";
  if (!observations || observations.length === 0) {
    eligibilityStatus = "no_observations";
  } else if (diag.usableObservations === 0) {
    eligibilityStatus = "observations_invalid";
  } else if (diag.reason === "insufficient_nodes") {
    eligibilityStatus = "insufficient_evidence";
  } else if (
    diag.reason === "collinear_geometry" ||
    diag.reason === "duplicate_coordinates" ||
    diag.reason === "calculation_error"
  ) {
    eligibilityStatus = "localization_unavailable";
  } else if (diag.result) {
    eligibilityStatus = "active_zone";
  }

  const warnings = [...diag.warnings];
  const limitations = [
    "Search zones are probabilistic multi-sensor priority contours, not exact survivor GPS coordinates.",
    "Log-distance path loss assumes isotropic RF propagation; structural debris and metal voids introduce multipath fading.",
  ];
  if (diag.gdop && diag.gdop > 3.0) {
    warnings.push(
      `Elevated Geometric Dilution of Precision (GDOP ${diag.gdop.toFixed(2)}): Sensor angles create directional uncertainty.`,
    );
  }

  return {
    timestamp: Date.now(),
    sourceMode,
    estimatorVersion: ESTIMATOR_VERSION,
    totalInputObservations: diag.totalObservations,
    usableObservationCount: diag.usableObservations,
    rejectedObservations: diag.rejectedObservations,
    contributingNodes: diag.result?.nodes ?? [],
    eligibilityStatus,
    positionEstimateProduced: diag.result !== null,
    result: diag.result,
    searchZone: diag.result
      ? {
          id: "ZONE-EST",
          ts: Date.now(),
          lat: diag.result.lat,
          lon: diag.result.lon,
          radius: diag.result.radius,
          score: Math.round(diag.result.confidence),
          priority: diag.result.confidence > 75 ? ("HIGH" as const) : ("MEDIUM" as const),
          evidence: {
            wirelessPersistence: 0.8,
            rssiStrength: 0.7,
            sound: 0,
            vibration: 0,
            thermal: 0,
          },
          contributingNodes: diag.result.nodes,
          note: "Multilateration search zone candidate",
          residual: diag.result.residual,
          confidence: diag.result.confidence,
          hypothetical_search_priority: true,
        }
      : null,
    geometryScore: diag.geometryScore,
    gdop: diag.gdop,
    warnings,
    limitations,
  };
}

/* ------------------------------------------------------------------ */
/* Prototype rule-based sensor fusion                                  */
/* Structured so an ML model / API can replace scoreEvidence() later.  */
/* ------------------------------------------------------------------ */
export const FUSION_WEIGHTS: Record<keyof EvidenceBreakdown, number> = {
  wirelessPersistence: 0.3,
  rssiStrength: 0.25,
  sound: 0.18,
  vibration: 0.15,
  thermal: 0.12,
};

const norm = (v: number, lo: number, hi: number) => {
  if (!Number.isFinite(v) || !Number.isFinite(lo) || !Number.isFinite(hi) || hi === lo) return 0;
  return clamp((v - lo) / (hi - lo), 0, 1);
};

export function buildEvidence(nodes: SensorNode[], persistence: number): EvidenceBreakdown {
  const active = (nodes ?? []).filter(
    (n) => n && n.status !== "offline" && Number.isFinite(n.rssi),
  );
  if (active.length === 0) {
    return {
      wirelessPersistence: 0,
      rssiStrength: 0,
      sound: 0,
      vibration: 0,
      thermal: 0,
    };
  }
  const avg = (f: (n: SensorNode) => number) => {
    const vals = active.map(f).filter(Number.isFinite);
    return vals.length > 0 ? vals.reduce((s, v) => s + v, 0) / vals.length : 0;
  };
  const rssiVals = active.map((n) => n.rssi).filter(Number.isFinite);
  const maxRssi = rssiVals.length > 0 ? Math.max(...rssiVals) : -100;

  return {
    wirelessPersistence: clamp(Number.isFinite(persistence) ? persistence : 0, 0, 1),
    rssiStrength: Number.isFinite(maxRssi) ? norm(maxRssi, -100, -45) : 0,
    sound: norm(
      avg((n) => n.sound),
      30,
      80,
    ),
    vibration: norm(
      avg((n) => n.vibration),
      0.02,
      0.6,
    ),
    thermal: norm(
      avg((n) => n.temperature),
      26,
      35,
    ),
  };
}

export function scoreEvidence(e: EvidenceBreakdown) {
  if (!e) return 0;
  const raw = (Object.keys(FUSION_WEIGHTS) as (keyof EvidenceBreakdown)[]).reduce(
    (s, k) => s + FUSION_WEIGHTS[k] * (Number.isFinite(e[k]) ? clamp(e[k], 0, 1) : 0),
    0,
  );
  // Consistency factor: scattered evidence is penalised (false-positive guard).
  const vals = Object.values(e).map((v) => (Number.isFinite(v) ? clamp(v, 0, 1) : 0));
  const mean = vals.length > 0 ? vals.reduce((s, v) => s + v, 0) / vals.length : 0;
  const sd = Math.sqrt(vals.reduce((s, v) => s + (v - mean) ** 2, 0) / Math.max(1, vals.length));
  const consistency = clamp(1 - sd * 0.7, 0.55, 1);
  return Math.round(clamp(raw * consistency * 100, 0, 99));
}

export function priorityOf(score: number): Priority {
  if (score >= 68) return "HIGH";
  if (score >= 42) return "MEDIUM";
  return "LOW";
}
