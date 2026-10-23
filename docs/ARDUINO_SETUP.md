# TRACE Arduino & ESP32 Firmware Setup Guide

## 1. Target Hardware & Specifications

- **Microcontroller**: ESP32-WROOM-32D / ESP32-S3 (Dual-core 240 MHz, 4 MB Flash).
- **Radio Transceiver**: Semtech SX1262 or SX1276 LoRa Module (SPI interface).
- **Primary Radio Frequency**: 868.1 MHz (EU/IN Band) or 915.0 MHz (US Band).
- **Promiscuous Sniffing**: 2.4 GHz IEEE 802.15.1 BLE 4.2/5.0 advertising frames + 802.11 b/g/n probe requests.

---

## 2. Required Libraries

Install via **Arduino IDE Library Manager** (`Ctrl+Shift+I`) or **PlatformIO**:

1. **`RadioLib`** (by Jan Gromes, version 6.6.0+) — Universal SX126x/SX127x LoRa driver.
2. **`ArduinoJson`** (by Benoit Blanchon, version 7.1.0+) — Fast RFC-compliant JSON serialization.
3. **`NimBLE-Arduino`** (by h2zero, version 1.4.2+) — Low-memory promiscuous BLE scanner.

PlatformIO `platformio.ini` dependency snippet:

```ini
lib_deps =
    jgromes/RadioLib @ ^6.6.0
    bblanchon/ArduinoJson @ ^7.1.0
    h2zero/NimBLE-Arduino @ ^1.4.2
```

---

## 3. Gateway Concentrator Sketch (`trace_gateway.ino`)

The gateway listens continuously for incoming LoRa packets from distributed sniffer anchors and forwards them over USB serial as JSON lines to the companion daemon:

```cpp
#include <RadioLib.h>
#include <ArduinoJson.h>

// Pin configuration for SX1262
#define LORA_CS    5
#define LORA_DIO1  14
#define LORA_RST   26
#define LORA_BUSY  2

SX1262 radio = new Module(LORA_CS, LORA_DIO1, LORA_RST, LORA_BUSY);

void setup() {
  Serial.begin(115200);
  while (!Serial);

  Serial.println(F("{\"type\":\"gateway_boot\",\"gatewayId\":\"GW01\",\"status\":\"initializing\"}"));

  int state = radio.begin(868.1, 125.0, 7, 7, 0x12, 14, 8);
  if (state == RADIOLIB_ERR_NONE) {
    Serial.println(F("{\"type\":\"gateway_boot\",\"gatewayId\":\"GW01\",\"status\":\"online\"}"));
  } else {
    Serial.print(F("{\"type\":\"gateway_error\",\"code\":"));
    Serial.print(state);
    Serial.println(F("}"));
    while (true);
  }
}

void loop() {
  String rxData;
  int state = radio.receive(rxData);

  if (state == RADIOLIB_ERR_NONE) {
    // Print verbatim line to host over USB serial
    Serial.println(rxData);
  }
}
```

---

## 4. Sniffer Station Sketch (`trace_sniffer.ino`)

The sniffer station listens for BLE advertising packets emitted by mobile devices, packages the observed RSSI, and transmits a LoRa packet to the gateway:

```cpp
#include <NimBLEDevice.h>
#include <RadioLib.h>
#include <ArduinoJson.h>

#define NODE_ID "NODE_01"
#define LORA_CS    5
#define LORA_DIO1  14
#define LORA_RST   26
#define LORA_BUSY  2

SX1262 radio = new Module(LORA_CS, LORA_DIO1, LORA_RST, LORA_BUSY);
uint32_t packetSeq = 0;

void setup() {
  Serial.begin(115200);
  radio.begin(868.1, 125.0, 7, 7, 0x12, 14, 8);

  NimBLEDevice::init(NODE_ID);
  NimBLEScan* pScan = NimBLEDevice::getScan();
  pScan->setActiveScan(false);
  pScan->setInterval(100);
  pScan->setWindow(99);
}

void loop() {
  NimBLEScan* pScan = NimBLEDevice::getScan();
  NimBLEScanResults results = pScan->start(2, false);

  for (int i = 0; i < results.getCount(); i++) {
    NimBLEAdvertisedDevice dev = results.getDevice(i);
    int rssi = dev.getRSSI();

    if (rssi > -110) {
      StaticJsonDocument<384> doc;
      doc["version"] = "2.4";
      doc["msgId"] = String(NODE_ID) + "-" + String(millis()) + "-" + String(packetSeq++);
      doc["deviceId"] = NODE_ID;
      doc["gatewayId"] = "GW01";
      doc["seq"] = packetSeq;
      doc["deviceTimestamp"] = millis();
      doc["msgType"] = "observation";
      doc["source"] = "live_hardware";

      JsonObject m = doc.createNestedObject("measurements");
      m["rssi"] = rssi;
      m["signalType"] = "BLE";

      String payload;
      serializeJson(doc, payload);
      radio.transmit(payload);
    }
  }
  pScan->clearResults();
  delay(1000);
}
```

---

## 5. Physical Verification Notice

> **IMPORTANT**: Uploading firmware and testing over radio frequencies requires the physical ESP32 and SX1262 hardware connected to your machine via USB. In software-only environments, use the built-in **Simulation Mode** or feed synthetic test packets using the companion script `scripts/trace_gateway_daemon.py`.
