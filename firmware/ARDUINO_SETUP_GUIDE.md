# TRACE — Complete 3-Node & 1-Gateway Arduino IDE Setup Guide

This guide walks you step-by-step through setting up, wiring, configuring, and flashing **3 Field Sniffer Nodes** (`NODE-N01`, `NODE-N02`, `NODE-N03`) and **1 Master Gateway Concentrator** (`GW-PRIMARY-ALPHA`) using the **Arduino IDE**.

---

## 1. Hardware Overview & Bill of Materials

| Device | Role in System | Hardware Components | Code File to Open in Arduino IDE |
|---|---|---|---|
| **Node 1** | North-East Anchor Station | ESP32 DevKit + SX1276/SX1278 (or SX1262) | `firmware/node1_sniffer/node1_sniffer.ino` |
| **Node 2** | North-West Anchor Station | ESP32 DevKit + SX1276/SX1278 (or SX1262) | `firmware/node2_sniffer/node2_sniffer.ino` |
| **Node 3** | South-East Anchor Station | ESP32 DevKit + SX1276/SX1278 (or SX1262) | `firmware/node3_sniffer/node3_sniffer.ino` |
| **Gateway** | Master LoRa Receiver & PC Bridge | ESP32 DevKit + SX1276/SX1278 (or SX1262) | `firmware/trace_gateway/trace_gateway.ino` |

---

## 2. Hardware Wiring & Pinout Diagram

Connect the LoRa transceiver module (Ra-02, RFM95W, or SX1262) to the ESP32 DevKit pins via SPI:

### SPI Wiring Table (Applies to all 3 Nodes and the Gateway):

| ESP32 DevKit Pin | LoRa Module Pin (SX1278 / SX1276 / Ra-02 / RFM95) | Notes |
|---|---|---|
| **3V3** | **VCC** | ⚠️ **DO NOT CONNECT TO 5V** — 3.3V logic only! |
| **GND** | **GND** | Common ground |
| **GPIO 18** | **SCK** / CLK | SPI Clock |
| **GPIO 19** | **MISO** | SPI Master In / Slave Out |
| **GPIO 23** | **MOSI** | SPI Master Out / Slave In |
| **GPIO 5** | **NSS** / CS | SPI Chip Select |
| **GPIO 26** | **RST** / RESET | Radio Hardware Reset |
| **GPIO 14** | **DIO0** (or DIO1 for SX1262) | Packet Rx/Tx Interrupt |
| *(Unconnected)* | **BUSY** (SX1262 only) | Connect to GPIO 27 only if using SX1262 |

### Optional Sensor Connections (On the 3 Sniffer Nodes):
- **Microphone / Sound Sensor (KY-038 or MAX9814):** Connect Analog Out to **GPIO 34**.
- **Battery Divider (1S Li-ion 3.7V - 4.2V):** Connect 100kΩ / 100kΩ resistor divider midpoint to **GPIO 35**.
- *(If no sensors are connected, the code automatically uses safe calibrated nominal values).*

---

## 3. Arduino IDE Setup (Step-by-Step)

### Step 1: Install ESP32 Board Package
1. Open **Arduino IDE** (v2.x recommended).
2. Go to **File -> Preferences** (or `Ctrl + ,`).
3. In **Additional boards manager URLs**, paste:
   ```text
   https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json
   ```
4. Click **OK**.
5. Go to **Tools -> Board -> Boards Manager...** (or click the board icon on the left).
6. Search for `esp32` (by **Espressif Systems**) and click **Install**.

### Step 2: Install Required Arduino Libraries
Go to **Sketch -> Include Library -> Manage Libraries...** (or `Ctrl + Shift + I`), then search for and install:

1. **`RadioLib`** (by **Jan Gromes**) -> Install version `6.6.0` or higher.
2. **`ArduinoJson`** (by **Benoit Blanchon**) -> Install version `7.x` or `6.x`.
3. **`NimBLE-Arduino`** (by **h2zero**) -> Install version `1.4.2` or higher.

---

## 4. Flashing the 3 Sniffer Nodes

### Node 1 (North-East Anchor):
1. Plug your **first ESP32** into your computer via USB.
2. In Arduino IDE, open:
   `firmware/node1_sniffer/node1_sniffer.ino`
3. Under **Tools -> Board**, select **ESP32 Dev Module**.
4. Under **Tools -> Port**, select the COM port for this board (e.g. `COM3`).
5. Click **Upload** (`Ctrl + U`).
6. Once uploaded, open the **Serial Monitor** (115200 baud). You will see:
   ```text
   TRACE Field Anchor: NODE-N01 (North-East)
   [LORA] OK: Radio initialized successfully
   [SYS] NODE-N01 ready.
   [LORA TX OK] -> {"deviceId":"NODE-N01","seq":1001,"latitude":19.876380,...}
   ```

### Node 2 (North-West Anchor):
1. Unplug Node 1, and plug in your **second ESP32**.
2. Open:
   `firmware/node2_sniffer/node2_sniffer.ino`
3. Select your COM port.
4. Click **Upload** (`Ctrl + U`).
5. Serial Monitor will confirm: `NODE-N02 ready`.

### Node 3 (South-East Anchor):
1. Unplug Node 2, and plug in your **third ESP32**.
2. Open:
   `firmware/node3_sniffer/node3_sniffer.ino`
3. Select your COM port.
4. Click **Upload** (`Ctrl + U`).
5. Serial Monitor will confirm: `NODE-N03 ready`.

---

## 5. Flashing the Gateway Concentrator

1. Plug in your **fourth ESP32** (Gateway).
2. Open:
   `firmware/trace_gateway/trace_gateway.ino`
3. Under **Tools -> Board**, select **ESP32 Dev Module**.
4. Select the COM port.
5. Click **Upload** (`Ctrl + U`).
6. Open the **Serial Monitor** at **115200 baud**. You will see:
   ```text
   TRACE Master LoRa Gateway Concentrator Bridge
   {"type":"gateway_boot","gatewayId":"GW-PRIMARY-ALPHA","status":"online","freq":868.1,"sf":7,"bw":125}
   ```
7. When Node 1, Node 2, or Node 3 transmit over LoRa, the Gateway immediately receives and outputs formatted telemetry JSON lines!

---

## 6. Connecting Hardware to the TRACE Dashboard

Leave your Gateway ESP32 plugged into your PC via USB.

### Method A: Using the Python Gateway Companion Daemon (Recommended)
From the project root in your terminal, run:
```bash
python scripts/trace_gateway_daemon.py --port COM4 --baud 115200
```
*(Replace `COM4` with your Gateway's actual COM port).*

The daemon automatically reads incoming packets from the Gateway and streams them to the local TRACE web server (`http://localhost:8080/api/telemetry/ingest`).

### Method B: Using Web Serial directly in your Browser (No Python Needed!)
1. Open the TRACE web application: `http://localhost:8080/settings`.
2. Scroll to the **Web Serial Diagnostic Port** card.
3. Click **Pair USB Device**.
4. Select your ESP32 Gateway from the browser pop-up.

---

## 7. Verifying Live Triangulation & Multilateration

1. Open `http://localhost:8080/` in your browser.
2. In the top header bar, click the **Live** button (to switch from `Sim` to `Live` physical hardware mode).
3. The **Gateway Online** indicator will turn bright green.
4. Go to `http://localhost:8080/devices`:
   - All 3 anchor stations (`NODE-N01`, `NODE-N02`, `NODE-N03`) will be shown as **Online** with their real RSSI values!
5. Go to `http://localhost:8080/map`:
   - The multilateral sensor fusion engine will calculate the live estimated **Search-Priority Zone** and display the probability circle on the tactical map!
