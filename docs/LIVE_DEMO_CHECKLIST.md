# TRACE Live Demonstration Checklist & Workflow

This checklist guides field operators, evaluators, and project review teams through a complete operational demonstration of the TRACE system.

---

## Pre-Flight Setup

- [ ] Dependencies installed (`npm install`).
- [ ] SQLite database seeded (`data/trace.db`).
- [ ] Application running (`npm run dev` or `npm run build && npm run preview`).
- [ ] Browser open to `http://localhost:3000`.

---

## Step 1: Tactical Command Center Overview (`/`)

- [ ] **Top Bar Inspection**:
  - Verify TRACE identity and active incident dropdown.
  - Check the `SIMULATION / LIVE HARDWARE` mode toggle.
  - Verify Gateway Online/Offline badge and API/DB health indicator.
  - Verify local real-time clock.
- [ ] **Incident Banner**:
  - Check active incident title, disaster type, and coordinates.
- [ ] **Recommended Next Action**:
  - Confirm the operational guidance card dynamically displays tactical recommendations based on current sensor coverage and zone status.
- [ ] **KPI Summary**:
  - Inspect Active Nodes, Anonymous Signals, Search Zones, Heuristic Confidence, and Mean Battery cards.

---

## Step 2: Live Tactical Map (`/map`)

- [ ] **Tactical Map Symbology**:
  - Red star/shield: Incident Command Center.
  - Blue radio tower: LoRa Gateway concentrator.
  - Cyan diamonds: Active sniffer stations (with GPS vs configured labels).
  - Amber shaded circles: Probable search-priority zones with true geometric metric radius (not distorted).
- [ ] **Interactive Inspector**:
  - Click on any sniffer or search zone.
  - Verify floating inspector displays: Entity ID, Entity Type, Decimal Degree GPS coordinates, Distance & Bearing from Command Center, Data Provenance.
- [ ] **Map Controls**:
  - Test Zoom In / Zoom Out.
  - Test Pan drag.
  - Test Reset View.
  - Test Layer Toggles (Incident Perimeter, Grid Overlay, Search Zones, Antenna Range).

---

## Step 3: Devices & Calibration Workspace (`/devices`)

- [ ] **Gateway & Network Overview**:
  - Verify LoRa Gateway status card (Active Frequency, Ingress Endpoint, Last Heartbeat).
  - Inspect Companion Daemon setup command (`python scripts/trace_gateway_daemon.py`).
- [ ] **Sensor Node Inventory**:
  - Review table of sniffer stations with Battery, LoRa RSSI, SNR, and GPS status.
  - Click on a node to view the diagnostics modal.
- [ ] **RF Calibration Wizard**:
  - Switch to the **RF Calibration** tab.
  - Step 1: Inspect environment parameters (`Collapsed Wing B Concrete`, `2.4 GHz BLE`).
  - Step 2: Review reference samples ($1\text{ m}, 3\text{ m}, 5\text{ m}, 10\text{ m}$). Test adding a sample manually or via live capture.
  - Step 3: Inspect the fitted model diagnostics ($A_0$, $n$, $\text{RMSE}$, $R^2$, residual plot).
  - Step 4: Click **Save & Activate Profile**. Verify new profile appears in saved profiles list.

---

## Step 4: Mode Switching & Data Isolation

- [ ] Switch top bar toggle from **Simulation** to **Live Hardware**.
- [ ] Verify that synthetic survivor signals and simulation events are completely halted.
- [ ] Verify that if no physical gateway is connected, the UI explicitly reports `Awaiting Live Telemetry / Disconnected` rather than inventing fake data.
- [ ] Switch back to **Simulation** mode; verify simulation resumes with deterministic seed.

---

## Step 5: Incident History & Mission Export (`/history`)

- [ ] **Incidents Tab**:
  - Select an incident and inspect the chronological operational timeline.
- [ ] **Localization Runs Tab**:
  - Inspect historical multilateration fixes with GDOP, uncertainty radius, and contributing sniffer list.
- [ ] **Audit Events Tab**:
  - Search and filter the append-only audit event log.
- [ ] **CSV Export**:
  - Click **Export Mission CSV**.
  - Verify downloaded CSV file opens cleanly with RFC-4180 compliance and formula injection protection.
