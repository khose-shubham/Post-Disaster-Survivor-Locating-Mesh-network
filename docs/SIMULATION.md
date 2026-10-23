# TRACE Simulation Engine & Scenario Presets

## 1. Simulation Architecture & Data Isolation

The TRACE simulation engine models a multi-node RF sensing deployment in collapsed urban environments. It exercises the exact same math, ingestion, validation, and search-zone estimation pipeline used by live physical hardware.

### Non-Negotiable Isolation Constraints:
1. **Mode Separation:** The platform maintains an explicit mode flag: `mode: "simulation" | "live"`.
2. **Synthetic Data Tagging:** All simulated telemetry messages are tagged with `source: "simulation"`.
3. **No Mixed Calibration:** Simulated samples cannot be saved as physical hardware calibration records without explicit operator confirmation and visual labeling.
4. **Auto-Halt on Live Hardware Ingestion:** When the gateway daemon starts streaming physical telemetry, the simulator automatically isolates itself to prevent synthetic signals from contaminating live rescue operations.

---

## 2. Supported Test Scenarios & Presets

The simulator supports 10 reproducible operational scenarios:

| Scenario | Objective | Simulated Conditions | Expected System Behavior |
|---|---|---|---|
| **1. Normal Operation** | Baseline verification | 3 online nodes, strong LoRa link, moderate Gaussian noise ($\sigma = 2\text{ dB}$) | Valid search zone generated with low GDOP ($< 2.0$) |
| **2. Weak Signal** | Range limit test | Target at perimeter, observed RSSI $\le -92\text{ dBm}$ | Expanded uncertainty circle with elevated residual error |
| **3. One Node Offline** | Redundancy loss | `NODE-N03` stops reporting | Alerts raised; multilateration falls back to 2-station intersection or reports `INSUFFICIENT_NODES` |
| **4. Gateway Disconnected** | Uplink transport failure | Concentrator `GW-01` drops off serial bridge | Dashboard displays critical alert `GATEWAY OFFLINE`; packet ingestion halts |
| **5. Poor Geometry (Collinear)** | GDOP degradation | 3 nodes placed in a nearly straight line | High GDOP ($> 5.0$) warning; search area elongated along perpendicular axis |
| **6. Insufficient Measurements** | Threshold rejection | Only 1 or 2 nodes observe the signal | Status `INSUFFICIENT_NODES (< 3)`; multilateration calculation rejected |
| **7. Calibration Required** | Model mismatch | Unknown RF environment | Warning banner prompting operator to run 4-step RF Calibration Wizard |
| **8. Strong Signal Observed** | Near-field casualty | Observed RSSI $> -50\text{ dBm}$ on at least one anchor | High priority alert; tight uncertainty radius ($< 8\text{ m}$) |
| **9. Stale Telemetry** | Intermittent transmitter | Packets age out beyond 60s window | Signal detection status transitions to `stale` then `lost` |
| **10. Reconnection Recovery** | Self-healing pipeline | Offline gateway re-establishes link | Buffer flush, auto-reconnect, and resumption of estimation |

---

## 3. Automated Simulation via Python Bridge

To feed simulated packets directly into the ingestion API without a browser UI:

```bash
python scripts/trace_gateway_daemon.py --simulate --rate 2.0 --api-key trace_dev_gateway_secret_2026
```

This streams synthetic LoRa frames through the full network stack, verifying the JSON parser, deduplication filter, and SSE real-time broadcast.
