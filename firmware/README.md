# TRACE Microcontroller Firmware Suite

This directory contains production-ready, open-source firmware sketches for the physical IoT hardware used in the TRACE disaster-response system.

---

## 1. Directory Structure

```text
firmware/
├── trace_gateway/
│   └── trace_gateway.ino       # ESP32 LoRa Gateway Concentrator & USB Serial Bridge
├── trace_sniffer/
│   └── trace_sniffer.ino       # ESP32 BLE/WiFi Promiscuous Sniffer Anchor Station
├── trace_beacon/
│   └── trace_beacon.ino        # Reference RF Calibration & Test Casualty Beacon
├── platformio.ini              # Unified PlatformIO compilation & flashing config
└── README.md                   # Complete wiring, pinout & flashing guide
```

---

## 2. Hardware Bill of Materials (BOM)

| Component | Recommended Model | Function |
|---|---|---|
| **Microcontroller** | ESP32-WROOM-32D (30-pin) or ESP32-S3 | Core processing, BLE scanning, and LoRa control |
| **Radio Transceiver** | Semtech SX1262 (Ebyte E22-900T22S) or SX1276 | Long-range telemetry uplink (868.1 / 915.0 MHz) |
| **Acoustic Sensor** | KY-038 or MAX9814 Microphone Module | Void acoustic SPL monitoring |
| **Battery Divider** | 100 kΩ / 100 kΩ Resistor Divider | 1S Li-ion (3.7V - 4.2V) ADC voltage telemetry |
| **Antenna** | 868/915 MHz 3dBi Omni-directional Dipole | Sub-GHz LoRa coverage |

---

## 3. Hardware Pinout Wiring Diagram

### ESP32 DevKit to SX1262 (SPI Interface)

```text
ESP32 DevKit Pin     SX1262 LoRa Breakout Pin
---------------------------------------------
GPIO 18 (SCK)   ---> SCK
GPIO 19 (MISO)  ---> MISO
GPIO 23 (MOSI)  ---> MOSI
GPIO 5  (CS)    ---> NSS / CS
GPIO 14 (DIO1)  ---> DIO1
GPIO 26 (RST)   ---> NRESET
GPIO 27 (BUSY)  ---> BUSY
3V3             ---> VCC (Ensure 300mA+ capability)
GND             ---> GND
```

> **Note for SX1276 / RFM95 Users:** If using an SX1276 module, connect DIO0 to GPIO 14 and leave `BUSY` unconnected (set to `-1`).

---

## 4. Software Setup & Flashing Instructions

### Option A: Using Arduino IDE

1. Open **Arduino IDE** (v2.x recommended).
2. Install the **ESP32 Board Support Package**:
   - Go to `File -> Preferences -> Additional Boards Manager URLs`.
   - Add: `https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json`
   - Open `Tools -> Board -> Boards Manager`, search for `esp32`, and install version `2.0.14` or `3.0.x`.
3. Install the required libraries via `Tools -> Manage Libraries`:
   - `RadioLib` (by Jan Gromes, version >= 6.6.0)
   - `ArduinoJson` (by Benoit Blanchon, version >= 7.1.0)
   - `NimBLE-Arduino` (by h2zero, version >= 1.4.2)
4. Open `firmware/trace_gateway/trace_gateway.ino`.
5. Connect your ESP32 Gateway to your computer via USB.
6. Select your board (e.g. `ESP32 Dev Module`) and the corresponding COM port (e.g. `COM3` on Windows or `/dev/ttyUSB0` on Linux/macOS).
7. Click **Upload** (`Ctrl+U`).

### Option B: Using PlatformIO CLI

```bash
# Flash the Gateway concentrator
pio run -e gateway -t upload

# Flash a Sniffer anchor station
pio run -e sniffer -t upload

# Flash a Calibration / Casualty beacon
pio run -e beacon -t upload
```

---

## 5. Serial Bridge Operation

Once the Gateway is flashed:
1. Leave the Gateway plugged into your USB port.
2. Start the TRACE Gateway Companion Daemon from the project root:
   ```bash
   python scripts/trace_gateway_daemon.py --port COM3 --baud 115200 --api-key trace_dev_gateway_secret_2026
   ```
3. The daemon automatically forwards received LoRa frames to `http://localhost:8080/api/telemetry/ingest`.
4. Open the TRACE web interface at `http://localhost:8080/devices` to verify live gateway connection status and incoming telemetry stream!
