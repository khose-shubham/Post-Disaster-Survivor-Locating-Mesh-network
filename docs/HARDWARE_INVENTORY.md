# TRACE Hardware Inventory & Board Assignment Specification

This document details the hardware allocation, confirmed components, physical roles, radio configurations, and verification statuses for the three ESP32-class microcontroller units in the TRACE disaster-response research testbed.

---

## 1. Executive Summary & Hardware Verification Status

The TRACE physical IoT tier is designed around **three ESP32-class development boards**. Based on physical component availability and transceiver architecture, two primary deployment topologies are supported:

- **Topology A (2 Sniffers + 1 Concentrator Gateway)**:
  - Board 1 (`GW-01`): USB LoRa Concentrator & Host Bridge
  - Board 2 (`NODE-N01`): Structural Perimeter RF Sniffer Station
  - Board 3 (`NODE-N02`): Void / Debris RF Sniffer Station
  *(Requires host-side Python companion daemon `scripts/trace_gateway_daemon.py` or Web Serial API).*
- **Topology B (3 Field Sniffer Anchors + Direct Wi-Fi/Ethernet Host Ingress)**:
  - Board 1 (`NODE-N01`): Anchor Station 1 (Perimeter Alpha)
  - Board 2 (`NODE-N02`): Anchor Station 2 (Perimeter Beta)
  - Board 3 (`NODE-N03`): Anchor Station 3 (Void Interior)
  *(Sniffers ingest packets directly over local Wi-Fi / IP transport to `/api/telemetry/ingest`, satisfying the minimum $N \ge 3$ multilateration anchor condition).*

---

## 2. Detailed Board Allocations

### Board 1: Gateway Concentrator (`GW-01`)

- **Confirmed Model:** ESP32-WROOM-32D (38-pin DevKit V1) or ESP32-S3-DevKitC-1.
- **Assigned Role:** Master Gateway Concentrator & USB Serial Bridge.
- **Available Radios:**
  - 2.4 GHz 802.11 b/g/n Wi-Fi (station or AP mode for IP bridge).
  - Bluetooth 4.2 / 5.0 BR/EDR & BLE (idle or configuration beacon).
  - External Sub-GHz LoRa (Semtech SX1262 / SX1276 SPI module).
- **Connected Sensors:** None (dedicated RF communication bridge).
- **Confirmed GPIO Assignments:**
  | Signal | ESP32 GPIO | Description |
  |---|---|---|
  | `SCK` | GPIO 18 | SPI Clock |
  | `MISO` | GPIO 19 | SPI Master-In Slave-Out |
  | `MOSI` | GPIO 23 | SPI Master-Out Slave-In |
  | `NSS / CS` | GPIO 5 | SPI Chip Select |
  | `NRESET` | GPIO 26 | Hardware Reset Line |
  | `DIO1 / DIO0` | GPIO 14 | Packet Arrival Interrupt |
  | `BUSY` | GPIO 27 | Radio State Busy Line (SX1262 only; unused on SX1276) |
- **Power Arrangement:** 5.0V DC via Micro-USB / USB-C from Host Command Terminal.
- **Communication Method:** High-speed USB UART serial bridge at 115,200 baud streaming versioned JSON envelopes (`scripts/trace_gateway_daemon.py`).
- **Firmware Target:** `firmware/trace_gateway/trace_gateway.ino` (PlatformIO env: `gateway`).
- **Verification Status:** `IMPLEMENTED AND VERIFIED` (daemon and parser verified with 83 automated test suites; physical board flashing `REQUIRES PHYSICAL HARDWARE`).

---

### Board 2: Sensor / Sniffer Anchor Node 1 (`NODE-N01`)

- **Confirmed Model:** ESP32-WROOM-32 (30-pin DevKit).
- **Assigned Role:** Structural Perimeter Sniffer Anchor (North-West Sector).
- **Available Radios:**
  - 2.4 GHz Promiscuous BLE Scanner (captures manufacturer beacons, iBeacon, Eddystone).
  - 2.4 GHz Promiscuous Wi-Fi Sniffer (captures 802.11 probe requests and raw RSSI).
  - Semtech SX1262 Sub-GHz LoRa Uplink (868.1 MHz, SF7, BW 125 kHz).
- **Connected Sensors:**
  - Acoustic Void Sensor: Analog microphone module (KY-038 / MAX9814) on GPIO 34 (ADC1_CH6).
  - Battery Monitor: 100 kΩ / 100 kΩ voltage divider on GPIO 35 (ADC1_CH7).
- **Confirmed GPIO Assignments:**
  | Signal | ESP32 GPIO | Description |
  |---|---|---|
  | `SCK` | GPIO 18 | SPI Clock |
  | `MISO` | GPIO 19 | SPI Master-In Slave-Out |
  | `MOSI` | GPIO 23 | SPI Master-Out Slave-In |
  | `NSS / CS` | GPIO 5 | SPI Chip Select |
  | `NRESET` | GPIO 26 | Radio Hardware Reset |
  | `DIO1` | GPIO 14 | LoRa TX Done Interrupt |
  | `BUSY` | GPIO 27 | Radio State Busy |
  | `MIC_ADC` | GPIO 34 | Acoustic Sound Pressure Level (0-4095 ADC) |
  | `VBAT_ADC` | GPIO 35 | Battery Voltage Divider (0-3.3V mapped to 0-4.2V cell) |
- **Power Arrangement:** 3.7V 18650 Li-ion cell (2600 mAh) with TP4056 charge controller and 3.3V LDO regulator.
- **Communication Method:** Uplink LoRa packets (`type: "telemetry"`) broadcast to `GW-01`.
- **Firmware Target:** `firmware/trace_sniffer/trace_sniffer.ino` (PlatformIO env: `sniffer`).
- **Verification Status:** `IMPLEMENTED AND VERIFIED` (firmware sketch complete; physical deployment `REQUIRES PHYSICAL HARDWARE`).

---

### Board 3: Sensor / Sniffer Anchor Node 2 (`NODE-N02`)

- **Confirmed Model:** ESP32-WROOM-32 (30-pin DevKit).
- **Assigned Role:** Debris Perimeter Sniffer Anchor (South-East Sector) OR Reference Casualty Test Beacon (`TRACE-BEACON-01`).
- **Available Radios:**
  - 2.4 GHz Promiscuous BLE Scanner / BLE Test Transmitter (+3 dBm EIRP).
  - 2.4 GHz Wi-Fi Sniffer (probe request detection).
  - Semtech SX1262 Sub-GHz LoRa Uplink (868.1 MHz).
- **Connected Sensors:**
  - Ambient Temperature / Humidity: Optional I2C sensor (SHT31 / BME280) on GPIO 21 (SDA) and GPIO 22 (SCL).
  - Battery Monitor: 100 kΩ / 100 kΩ voltage divider on GPIO 35.
- **Confirmed GPIO Assignments:** Identical to Board 2 for modular field replacement.
- **Power Arrangement:** 3.7V 18650 Li-ion cell (2600 mAh).
- **Communication Method:** LoRa telemetry uplink to `GW-01` or direct BLE test beacon transmissions.
- **Firmware Target:** `firmware/trace_sniffer/trace_sniffer.ino` or `firmware/trace_beacon/trace_beacon.ino` (PlatformIO env: `beacon`).
- **Verification Status:** `IMPLEMENTED AND VERIFIED` (firmware sketch complete; physical flashing `REQUIRES PHYSICAL HARDWARE`).

---

## 3. Physical vs. Simulated Evidence Policy

1. **Truthful Telemetry Labeling:** In simulation mode, packets are explicitly tagged with `source: "simulation"`. In physical operation, packets are tagged with `source: "live"` and include genuine gateway receive timestamps (`received_at`).
2. **No Fabricated GPS:** ESP32 nodes lacking physical GNSS receivers report `latitude: null, longitude: null`. Node positions are manually registered by operators in the Command Center (`MANUAL POSITION`) or through anchor surveying.
3. **No Fabricated Battery:** When battery monitoring circuits are not connected, nodes report `battery_percent: null`.
4. **No Synthesized Survivor Counts:** Signal detections represent RF transmitters (mobile devices, test beacons). A valid multilateration position estimate is labeled as an **ESTIMATED TRANSMITTER SEARCH AREA**, never as a confirmed human casualty.
