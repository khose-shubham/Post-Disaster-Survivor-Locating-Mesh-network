# TRACE Physical Hardware Test & Commissioning Checklist

This checklist must be executed by field engineers when deploying physical ESP32 hardware for TRACE operations.

---

## Pre-Power Inspection

- [ ] **Visual Solder Inspection:** Verify no solder bridges between ESP32 3.3V, GND, and GPIO pins.
- [ ] **Antenna Connection:** Ensure Sub-GHz dipole antennas (868/915 MHz) are securely threaded into SX1262 U.FL/SMA connectors before powering up (operating without an antenna can damage the PA).
- [ ] **Power Supply Voltage:** Verify 3.3V DC bus with a digital multimeter (must be between 3.20V and 3.45V under radio transmit load).

---

## Step 1: Flashing & Serial Diagnostics

- [ ] **Board 1 (Gateway):** Flash `firmware/trace_gateway/trace_gateway.ino`.
  - Expected serial output at 115,200 baud: `[TRACE_GW] SX1262 Initialized on 868.10 MHz SF7 BW125. Ready.`
- [ ] **Board 2 (Sniffer 1):** Flash `firmware/trace_sniffer/trace_sniffer.ino` with `NODE_ID = "NODE-N01"`.
  - Expected serial output: `[TRACE_SNIFFER] BLE promiscuous scanner active. LoRa uplink ready.`
- [ ] **Board 3 (Sniffer 2):** Flash `firmware/trace_sniffer/trace_sniffer.ino` with `NODE_ID = "NODE-N02"`.

---

## Step 2: Gateway Serial Bridge Connection

- [ ] Plug Gateway USB cable into host workstation.
- [ ] Execute port scan:
  ```bash
  python scripts/trace_gateway_daemon.py --list-ports
  ```
- [ ] Start daemon bridge:
  ```bash
  python scripts/trace_gateway_daemon.py --port COM3 --baud 115200 --api-key trace_dev_gateway_secret_2026
  ```
- [ ] Verify in TRACE Command Center:
  - Header indicator transitions to `Gateway Online (LoRa 868.1 MHz)`.
  - Host bridge reports `HTTP 200 OK` on `/api/telemetry/ingest`.

---

## Step 3: RF Transmission & Telemetry Ingestion

- [ ] Power on Sniffer `NODE-N01` via Li-ion battery.
- [ ] Observe gateway serial log: verify LoRa frame reception with valid CRC, RSSI (e.g., $-72\text{ dBm}$), and SNR ($> +6\text{ dB}$).
- [ ] Verify node appearance in TRACE `/devices` table with genuine last seen timestamp.
- [ ] Activate a mobile BLE device or test beacon (`TRACE-BEACON-01`).
- [ ] Verify detected MAC / UUID appears in the Live Signal Feed.

---

## Step 4: Empirical RF Calibration Run

- [ ] Navigate to `/calibration` in the TRACE web interface.
- [ ] Place test beacon at exactly $1.0\text{ m}$ from Sniffer. Click `Sample Live Hardware`. Record observed RSSI as $A_0$.
- [ ] Move test beacon to $3.0\text{ m}, 5.0\text{ m}$, and $10.0\text{ m}$. Record observed RSSI.
- [ ] Verify regression metrics: $R^2 \ge 0.85$, $1.8 \le n \le 4.5$, $\text{RMSE} \le 3.5\text{ dB}$.
- [ ] Click `Save & Activate Profile for Multilateration`.

---

## Step 5: Multi-Station Multilateration Verification

- [ ] Position 3 sniffers around a test search perimeter with non-collinear geometry.
- [ ] Verify that all 3 nodes simultaneously observe the test beacon.
- [ ] Confirm in `/map`:
  - 3 range rings intersect.
  - Multilateration solver calculates search zone center.
  - Uncertainty radius ($\pm \text{meters}$) and GDOP are displayed honestly without survivor count hallucination.
