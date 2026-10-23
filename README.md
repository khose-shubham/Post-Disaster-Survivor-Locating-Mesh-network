# TRACE — Triangulated Rescue Aid via Crowd-Signal Estimation

TRACE is a disaster-response research and tactical operations platform designed for rapid localization of trapped survivors in collapsed structures using crowd-signal RF sniffer triangulation, multi-station log-distance path-loss calibration, and real-time operational situational awareness.

---

## 1. Primary Operational Workspaces (6 Sections)

TRACE provides a clean, focused operational hierarchy for emergency responders:

1. **COMMAND CENTER (`/`)**: Tactical operational dashboard displaying incident state, hardware connectivity, online sensor nodes, recent observations, and defensible operational next actions.
2. **LIVE MAP (`/map`)**: Interactive 2D tactical map and 3D building/rubble view with metric projection, true geometric uncertainty circles, antenna coverage, coordinate inspection, and spatial layer toggles.
3. **DEVICES & SIGNALS (`/devices`)**: Hardware gateway concentrator monitoring, sniffer diagnostics, live signal feed, and station inventory.
4. **CALIBRATION (`/calibration`)**: Dedicated 4-step RF Path-Loss Calibration Wizard implementing closed-form OLS linear regression ($A_0$, $n$, $R^2$, RMSE, residuals) with database persistence.
5. **INCIDENT HISTORY (`/history`)**: Operational audit trail, chronological incident timelines, historical multilateration runs with GDOP and residual errors, and sanitized RFC-4180 CSV export.
6. **SETTINGS & HARDWARE (`/settings`)**: Hardware bridge configuration, Web Serial, daemon settings, and simulation lab workbench.

Secondary views (Incidents Registry `/incidents`, Signal Detections `/detections`, Survivors Registry `/survivors`, Rescue Operations `/operations`, Sensor Nodes `/nodes`, Gateway Concentrator `/gateway`, Topology `/topology`, Analytics `/analytics`, Logs `/logs`, Reports `/reports`, Alerts `/alerts`, Health `/health`, API Docs `/api-docs`, Hardware Setup `/hardware`) are accessible via the Secondary Modules drawer.

---

## 2. Technical Documentation Index

Detailed engineering documentation is maintained in the `docs/` directory:

- [**System Architecture (`docs/ARCHITECTURE.md`)**](docs/ARCHITECTURE.md): Complete pipeline specification from ESP32 sensor nodes to tactical command visualization.
- [**Hardware Inventory & Board Assignments (`docs/HARDWARE_INVENTORY.md`)**](docs/HARDWARE_INVENTORY.md): Roles, pinouts, radios, and verification status for the three ESP32 boards.
- [**Hardware Integration Guide (`docs/HARDWARE_INTEGRATION.md`)**](docs/HARDWARE_INTEGRATION.md): Physical ESP32 + SX1262 LoRa concentrator architecture, companion daemon setup, and pinout wiring reference.
- [**Arduino & ESP32 Firmware Setup (`docs/ARDUINO_SETUP.md`)**](docs/ARDUINO_SETUP.md): Arduino IDE & PlatformIO configuration, library dependencies (`RadioLib`, `ArduinoJson`, `NimBLE`), and firmware sketches for gateway, sniffer, and beacon.
- [**Telemetry Protocol Specification (`docs/TELEMETRY_PROTOCOL.md`)**](docs/TELEMETRY_PROTOCOL.md): Versioned JSON packet envelope (v2.0), field boundaries, validation rules, and duplicate detection.
- [**Localization Model Specification (`docs/LOCALIZATION_MODEL.md`)**](docs/LOCALIZATION_MODEL.md): Weighted least-squares multilateration algorithm, GDOP formulation, collinearity rejection, and search-priority zone derivation.
- [**RF Path-Loss Calibration Guide (`docs/RF_CALIBRATION.md`)**](docs/RF_CALIBRATION.md): Log-distance path-loss mathematical model, OLS closed-form solver, goodness-of-fit diagnostics ($A_0, n, \text{RMSE}, R^2$), and field procedures.
- [**Database Architecture (`docs/DATABASE.md`)**](docs/DATABASE.md): SQLite schema (17 tables), WAL mode, migrations, indexing, and seed records.
- [**REST API & SSE Specification (`docs/API.md`)**](docs/API.md): Endpoints, schemas, validation rules, and real-time Server-Sent Events.
- [**Simulation Engine Guide (`docs/SIMULATION.md`)**](docs/SIMULATION.md): 10 operational scenario presets and strict data isolation policies.
- [**Troubleshooting & Diagnostics (`docs/TROUBLESHOOTING.md`)**](docs/TROUBLESHOOTING.md): Remediation steps for map coordinates, COM port locks, baud mismatches, and calibration errors.
- [**Hardware Test Checklist (`docs/HARDWARE_TEST_CHECKLIST.md`)**](docs/HARDWARE_TEST_CHECKLIST.md): Step-by-step physical commissioning checklist for ESP32 hardware.
- [**Live Demonstration Checklist (`docs/LIVE_DEMO_CHECKLIST.md`)**](docs/LIVE_DEMO_CHECKLIST.md): Step-by-step operational demonstration guide for field teams and evaluators.

---

## 3. Architecture & Data Flow

```text
PHYSICAL TRANSMITTER (Mobile BLE / Wi-Fi Device)
                    │
                    ▼  2.4 GHz RF (BLE Advertising / Wi-Fi Probe Requests)
   [ESP32 SNIFFER NODES: NODE_01, NODE_02, NODE_03]
                    │
                    ▼  LoRa 868.1 MHz Uplink (SX1262 / SX1276 Module)
        [ESP32 GATEWAY CONCENTRATOR (GW01)]
                    │
                    ▼  USB UART Serial Bridge (115200 baud)
  [HOST MACHINE: scripts/trace_gateway_daemon.py]
                    │
                    ▼  HTTP POST (JSON Telemetry Protocol v2.4)
     [TRACE BACKEND: /api/telemetry/ingest]
                    │
                    ▼  SQLite Database (`data/trace.db`) & Multilateration Engine
    [TRACE WEB CONSOLE & TACTICAL MAP DISPLAY]
```

---

## 4. Quickstart: Running TRACE Locally

### Prerequisites

- **Node.js**: v22+ or v24+ (`node:sqlite` zero-dependency SQLite engine built-in)
- **Python**: 3.9+ (optional, for running the physical gateway companion daemon)

### 1. Environment Setup

Copy the environment template:

```bash
cp .env.example .env
```

Default parameters in `.env`:

```ini
PORT=8080
NODE_ENV=development
DATABASE_PATH=data/trace.db
SESSION_SECRET=trace_dev_secret_key_change_in_production_min_32_chars
GATEWAY_SECRET=trace_dev_gateway_secret_2026
CORS_ORIGIN=*
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Run Development Server

```bash
npm run dev
```

Open `http://localhost:8080` (or `http://localhost:3000`) in your browser.

### 4. Build & Preview Production Bundle

```bash
npm run build
npm run preview
```

---

## 5. Connecting Physical Hardware vs Simulation Mode

### A. Strict Data Mode Separation

TRACE provides strict physical isolation between data sources:

- **`LIVE HARDWARE` Mode**: Telemetry is ONLY accepted from verified hardware uplinks. If the gateway or sniffer is disconnected, the UI explicitly reports `DISCONNECTED / AWAITING TELEMETRY`. It **never** fabricates fake telemetry to appear functional.
- **`SIMULATION` Mode**: Generates synthetic multi-station RF scenarios for operator training with deterministic PRNG seeds, obstacle attenuation, and noise models. All synthetic records are explicitly tagged `[SIMULATION DATA]`.

### B. Connecting the Physical ESP32 Gateway

1. Flash your ESP32 gateway with the sketch in `docs/ARDUINO_SETUP.md`.
2. Connect the gateway to your host PC via USB.
3. Start the companion daemon:
   ```bash
   # Windows (check Device Manager for COM port)
   python scripts/trace_gateway_daemon.py --port COM3 --baud 115200 --api-key trace_dev_gateway_secret_2026

   # Linux / macOS
   python scripts/trace_gateway_daemon.py --port /dev/ttyUSB0 --baud 115200 --api-key trace_dev_gateway_secret_2026
   ```
4. Verify on **Devices & Calibration** (`/devices`) that the gateway indicator switches to `ONLINE`.

---

## 6. Verification & Automated Tests

All tests, type checks, and linters pass with zero errors:

```bash
# 1. Run automated unit & integration test suites (82/82 passing):
npm test

# 2. Run TypeScript strict type verification (0 errors):
npx tsc --noEmit

# 3. Run ESLint code quality & security checks (0 errors):
npm run lint

# 4. Verify production bundle build:
npm run build
```

---

## 7. Safety & Operational Mandates

- **Probabilistic Search Areas**: Estimated search zones are statistical priority areas derived from RF propagation models, never confirmed survivor locations.
- **No False Assurances**: Absence of telemetry is never interpreted as proof of survivor absence.
- **Anonymized MAC Hashes**: Probe requests and BLE advertisements are cryptographically hashed; no civilian personal identity is stored or inferred.
