/*
 * =====================================================================================
 * TRACE — Triangulated Rescue Aid via Crowd-Signal Estimation
 * PHYSICAL IoT MASTER GATEWAY CONCENTRATOR (ESP32 + LoRa + USB / Wi-Fi Uplink)
 *
 * Identity        : GW-PRIMARY-ALPHA (Master LoRa Gateway)
 * Microcontroller : ESP32-WROOM-32 / ESP32-S3 (30-pin or 38-pin DevKit)
 * Radio Modules   : SX1276 / SX1278 (Ra-02 / RFM95W) OR SX1262 (Ebyte E22)
 * Function        : Collects multi-anchor field packets over LoRa and bridges them
 *                   to the TRACE Command Platform via USB Serial (115200 baud)
 *                   OR optionally via direct Wi-Fi HTTP POST!
 * =====================================================================================
 */

// =====================================================================================
// 1. SELECT YOUR LORA RADIO MODULE TYPE
// =====================================================================================
#define RADIO_TYPE_SX1278_SX1276   // <-- Default: SX1278 (433MHz) or SX1276 (868/915MHz)
//#define RADIO_TYPE_SX1262        // <-- Uncomment if using SX1262

// =====================================================================================
// 2. FREQUENCY & MODULATION SETTINGS (Must match the 3 Field Sniffer Nodes)
// =====================================================================================
#define LORA_FREQ_MHZ  868.1   // 868.1 MHz (India/EU). Change to 433.0 or 915.0 if needed
#define LORA_BW_KHZ    125.0
#define LORA_SF        7
#define LORA_CR        7
#define LORA_SYNCWORD  0x12
#define LORA_POWER_DBM 14

// =====================================================================================
// 3. SPI & PIN DEFINITIONS (Standard ESP32 DevKit Wiring)
// =====================================================================================
#define LORA_CS        5       // NSS / CS
#define LORA_RST       26      // Reset
#define LORA_DIO0_DIO1 14      // DIO0 for SX1278/SX1276 | DIO1 for SX1262
#define LORA_BUSY      27      // BUSY pin (only for SX1262)
#define STATUS_LED     2       // Onboard LED

#define GATEWAY_ID     "GW-PRIMARY-ALPHA"

// =====================================================================================
// 4. OPTIONAL WI-FI DIRECT UPLINK
// If you want the Gateway to post directly to your server over Wi-Fi without Python:
// Set ENABLE_WIFI_UPLINK to 1 and enter your Wi-Fi details and computer IP.
// Otherwise, keep it at 0 to use the standard high-reliability USB Serial connection!
// =====================================================================================
#define ENABLE_WIFI_UPLINK  0
const char* WIFI_SSID     = "Your_WiFi_SSID";
const char* WIFI_PASSWORD = "Your_WiFi_Password";
const char* SERVER_URL    = "http://192.168.1.100:8080/api/telemetry/ingest";

// =====================================================================================
// LIBRARIES REQUIRED:
// Install via Arduino IDE Library Manager:
//   1. "RadioLib" by Jan Gromes (v6.6.0 or higher)
//   2. "ArduinoJson" by Benoit Blanchon (v6.x or v7.x)
// =====================================================================================
#include <RadioLib.h>
#include <ArduinoJson.h>

#if ENABLE_WIFI_UPLINK
  #include <WiFi.h>
  #include <HTTPClient.h>
#endif

#if defined(RADIO_TYPE_SX1262)
  SX1262 radio = new Module(LORA_CS, LORA_DIO0_DIO1, LORA_RST, LORA_BUSY);
#else
  SX1278 radio = new Module(LORA_CS, LORA_DIO0_DIO1, LORA_RST, -1);
#endif

uint32_t lastHeartbeat = 0;
const uint32_t HEARTBEAT_INTERVAL_MS = 15000;
uint32_t totalPacketsReceived = 0;

void blinkLed(uint8_t count = 1, uint16_t durationMs = 50) {
  for (uint8_t i = 0; i < count; i++) {
    digitalWrite(STATUS_LED, HIGH);
    delay(durationMs);
    digitalWrite(STATUS_LED, LOW);
    if (i + 1 < count) delay(50);
  }
}

#if ENABLE_WIFI_UPLINK
void forwardHttpTelemetry(const String& jsonPayload) {
  if (WiFi.status() != WL_CONNECTED) return;
  HTTPClient http;
  http.begin(SERVER_URL);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Trace-Gateway-Secret", "trace_dev_gateway_secret_2026");
  int code = http.POST(jsonPayload);
  http.end();
}
#endif

void setup() {
  pinMode(STATUS_LED, OUTPUT);
  digitalWrite(STATUS_LED, LOW);

  Serial.begin(115200);
  delay(1000);

  Serial.println();
  Serial.println(F("===================================================="));
  Serial.println(F(" TRACE Master LoRa Gateway Concentrator Bridge"));
  Serial.print(F(" Gateway ID : ")); Serial.println(F(GATEWAY_ID));
  Serial.print(F(" Frequency  : ")); Serial.print(LORA_FREQ_MHZ); Serial.println(F(" MHz"));
  Serial.println(F("===================================================="));

  // Initialize RadioLib LoRa
  #if defined(RADIO_TYPE_SX1262)
    int state = radio.begin(LORA_FREQ_MHZ, LORA_BW_KHZ, LORA_SF, LORA_CR, LORA_SYNCWORD, LORA_POWER_DBM);
  #else
    int state = radio.begin(LORA_FREQ_MHZ, LORA_BW_KHZ, LORA_SF, LORA_CR, LORA_SYNCWORD, LORA_POWER_DBM, 8);
  #endif

  if (state == RADIOLIB_ERR_NONE) {
    Serial.println(F("{\"type\":\"gateway_boot\",\"gatewayId\":\"" GATEWAY_ID "\",\"status\":\"online\",\"freq\":868.1,\"sf\":7,\"bw\":125}"));
    blinkLed(3, 100);
  } else {
    Serial.print(F("{\"type\":\"gateway_error\",\"gatewayId\":\"" GATEWAY_ID "\",\"error\":\"radio_init_failed\",\"code\":"));
    Serial.print(state);
    Serial.println(F("}"));
    Serial.println(F("[ERR] Check SPI wiring (CS=5, RST=26, DIO0=14, SCK=18, MISO=19, MOSI=23)"));
    while (true) {
      blinkLed(1, 500);
      delay(500);
    }
  }

  #if ENABLE_WIFI_UPLINK
    Serial.print(F("[WIFI] Connecting to SSID: "));
    Serial.println(WIFI_SSID);
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    uint32_t t0 = millis();
    while (WiFi.status() != WL_CONNECTED && millis() - t0 < 10000) {
      delay(500);
      Serial.print(F("."));
    }
    if (WiFi.status() == WL_CONNECTED) {
      Serial.print(F("\n[WIFI] Connected! Gateway IP: "));
      Serial.println(WiFi.localIP());
    } else {
      Serial.println(F("\n[WIFI] Failed to connect, continuing with USB Serial bridge only."));
    }
  #endif

  Serial.println(F("[SYS] Master Gateway Concentrator listening for node packets...\n"));
}

void loop() {
  String incomingData;
  // Listen for incoming packets over LoRa
  int state = radio.receive(incomingData);

  if (state == RADIOLIB_ERR_NONE) {
    totalPacketsReceived++;
    digitalWrite(STATUS_LED, HIGH);

    float loraSnr = radio.getSNR();
    float loraRssi = radio.getRSSI();

    incomingData.trim();
    if (incomingData.startsWith("{") && incomingData.endsWith("}")) {
      StaticJsonDocument<512> doc;
      DeserializationError err = deserializeJson(doc, incomingData);

      if (!err) {
        // Enrich telemetry with Gateway reception metadata
        doc["gatewayId"] = GATEWAY_ID;
        doc["loraRssi"] = loraRssi;
        doc["loraSnr"] = loraSnr;

        // 1. Output clean JSON line to USB Serial (115200 baud)
        String outputLine;
        serializeJson(doc, outputLine);
        Serial.println(outputLine);

        // 2. Optional direct Wi-Fi HTTP POST
        #if ENABLE_WIFI_UPLINK
          forwardHttpTelemetry(outputLine);
        #endif
      } else {
        // Forward raw string if deserialization failed
        Serial.println(incomingData);
      }
    } else {
      // Forward raw string
      Serial.println(incomingData);
    }

    digitalWrite(STATUS_LED, LOW);
  }

  // Periodic Gateway Heartbeat over Serial (Every 15s)
  if (millis() - lastHeartbeat >= HEARTBEAT_INTERVAL_MS) {
    lastHeartbeat = millis();
    Serial.print(F("{\"type\":\"gateway_heartbeat\",\"gatewayId\":\"" GATEWAY_ID "\",\"uptime\":"));
    Serial.print(millis() / 1000);
    Serial.print(F(",\"packetsReceived\":"));
    Serial.print(totalPacketsReceived);
    Serial.println(F("}"));
  }
}
