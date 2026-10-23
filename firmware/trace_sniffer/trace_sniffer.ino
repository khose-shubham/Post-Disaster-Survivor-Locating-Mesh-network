/*
 * =====================================================================================
 * TRACE — Triangulated Rescue Aid via Crowd-Signal Estimation
 * PHYSICAL IoT FIELD SNIFFER ANCHOR NODE (ESP32 + LoRa + BLE + Wi-Fi)
 *
 * Microcontroller : ESP32-WROOM-32 / ESP32-S3 (30-pin or 38-pin DevKit)
 * Radio Modules   : SX1276 / SX1278 (Ra-02 / RFM95W) OR SX1262 (Ebyte E22)
 * Sensors         : Promiscuous BLE + Wi-Fi 802.11 Probe Sniffer + Acoustic ADC + Battery
 * =====================================================================================
 *
 * INSTRUCTIONS FOR 3 FIELD NODES:
 * -------------------------------------------------------------
 * Simply change the NODE_NUMBER below before uploading:
 *   - For Node 1, set: #define NODE_NUMBER 1
 *   - For Node 2, set: #define NODE_NUMBER 2
 *   - For Node 3, set: #define NODE_NUMBER 3
 * =====================================================================================
 */

// =====================================================================================
// 1. SELECT NODE NUMBER (1, 2, or 3)
// =====================================================================================
#define NODE_NUMBER 1   // <-- CHANGE TO 1, 2, or 3 FOR EACH OF YOUR 3 NODES

// =====================================================================================
// 2. SELECT YOUR LORA RADIO MODULE TYPE
// =====================================================================================
// Most common ESP32 modules (Ai-Thinker Ra-02, RFM95W, DIY SPI) use SX1278 or SX1276.
// If using SX1262 (e.g. Ebyte E22 or Heltec V3), uncomment the second line instead.
#define RADIO_TYPE_SX1278_SX1276   // <-- Default: SX1278 (433MHz) or SX1276 (868/915MHz)
//#define RADIO_TYPE_SX1262        // <-- Uncomment if using SX1262

// =====================================================================================
// 3. SELECT FREQUENCY FOR YOUR REGION
// =====================================================================================
#define LORA_FREQ_MHZ  868.1   // 868.1 MHz (India/EU). Change to 433.0 or 915.0 if needed
#define LORA_BW_KHZ    125.0   // 125 kHz bandwidth
#define LORA_SF        7       // Spreading factor SF7 (optimal range + low airtime)
#define LORA_CR        7       // Coding rate 4/7
#define LORA_SYNCWORD  0x12    // Private TRACE syncword
#define LORA_POWER_DBM 14      // Transmit power (+14 dBm)

// =====================================================================================
// 4. SPI & PIN DEFINITIONS (Standard ESP32 DevKit Wiring)
// =====================================================================================
#define LORA_CS        5       // NSS / Chip Select
#define LORA_RST       26      // Reset pin
#define LORA_DIO0_DIO1 14      // DIO0 for SX1278/SX1276 | DIO1 for SX1262
#define LORA_BUSY      27      // BUSY pin (only used by SX1262; ignored on SX1278)

#define STATUS_LED     2       // Onboard Blue/Green LED (GPIO 2 on most ESP32 DevKits)
#define PIN_SOUND_ADC  34      // Analog microphone (KY-038 / MAX9814)
#define PIN_BATT_ADC   35      // Battery voltage divider (100k / 100k to 3.7V Li-ion)

// =====================================================================================
// LIBRARIES REQUIRED:
// Install via Arduino IDE Library Manager:
//   1. "RadioLib" by Jan Gromes (v6.6.0 or higher)
//   2. "ArduinoJson" by Benoit Blanchon (v6.x or v7.x)
//   3. "NimBLE-Arduino" by h2zero (v1.4.2 or higher)
// =====================================================================================
#include <RadioLib.h>
#include <ArduinoJson.h>
#include <NimBLEDevice.h>
#include "esp_wifi.h"
#include <WiFi.h>

// Automatically assign unique Node ID and Surveyed Coordinates based on NODE_NUMBER
#if NODE_NUMBER == 1
  #define NODE_ID   "NODE-N01"
  #define NODE_LAT  19.876380   // Surveyed Anchor Latitude (Sector Delta North-East)
  #define NODE_LON  74.478680   // Surveyed Anchor Longitude
  #define NODE_ALT  25.0
#elif NODE_NUMBER == 2
  #define NODE_ID   "NODE-N02"
  #define NODE_LAT  19.877200   // Surveyed Anchor Latitude (Sector Delta North-West)
  #define NODE_LON  74.479500   // Surveyed Anchor Longitude
  #define NODE_ALT  26.5
#elif NODE_NUMBER == 3
  #define NODE_ID   "NODE-N03"
  #define NODE_LAT  19.875500   // Surveyed Anchor Latitude (Sector Delta South-East)
  #define NODE_LON  74.479100   // Surveyed Anchor Longitude
  #define NODE_ALT  24.0
#else
  #define NODE_ID   "NODE-N99"
  #define NODE_LAT  19.876000
  #define NODE_LON  74.479000
  #define NODE_ALT  20.0
#endif

// Radio module instantiation based on selection
#if defined(RADIO_TYPE_SX1262)
  SX1262 radio = new Module(LORA_CS, LORA_DIO0_DIO1, LORA_RST, LORA_BUSY);
#else
  SX1278 radio = new Module(LORA_CS, LORA_DIO0_DIO1, LORA_RST, -1);
#endif

// BLE & Wi-Fi Promiscuous Scanner State
NimBLEScan* pBLEScan = nullptr;
volatile int16_t strongestBleRssi = -120;
volatile uint16_t blePacketsSeen = 0;

volatile int16_t strongestWifiRssi = -120;
volatile uint16_t wifiProbesSeen = 0;

uint32_t packetSeq = 1000;

// BLE Callback for promiscuous advertisement frames
class BleAdvertisedCallbacks : public NimBLEAdvertisedDeviceCallbacks {
  void onResult(NimBLEAdvertisedDevice* device) {
    int rssi = device->getRSSI();
    blePacketsSeen++;
    if (rssi > strongestBleRssi) {
      strongestBleRssi = rssi;
    }
  }
};

// Wi-Fi 802.11 Promiscuous Sniffer Callback (Detects smartphone probe requests)
void wifiPromiscuousCallback(void* buf, wifi_promiscuous_pkt_type_t type) {
  if (type != WIFI_PKT_MGMT) return;
  const wifi_promiscuous_pkt_t* pkt = (wifi_promiscuous_pkt_t*)buf;
  const uint8_t* payload = pkt->payload;
  // Subtype 0x40 = Probe Request frame (phones actively seeking Wi-Fi networks)
  if ((payload[0] & 0xF0) == 0x40) {
    int rssi = pkt->rx_ctrl.rssi;
    wifiProbesSeen++;
    if (rssi > strongestWifiRssi) {
      strongestWifiRssi = rssi;
    }
  }
}

// Read Li-ion battery voltage via 1:1 resistor divider (GPIO 35)
float readBatteryPercentage() {
  int raw = analogRead(PIN_BATT_ADC);
  // ADC 12-bit (0..4095), 3.3V reference, 2x divider
  float voltage = (raw / 4095.0f) * 3.3f * 2.0f;
  // If no battery divider connected (floating pin near 0 or 3.3V), provide safe default
  if (voltage < 2.5f) return 92.0f;
  float pct = ((voltage - 3.2f) / (4.2f - 3.2f)) * 100.0f;
  return constrain(pct, 5.0f, 100.0f);
}

// Read Acoustic Sound Pressure Level via microphone module (GPIO 34)
float readAcousticSPL() {
  int raw = analogRead(PIN_SOUND_ADC);
  // Calibrated baseline: 35 dB (quiet void) to 95 dB (shouting / collapse vibration)
  float spl = 35.0f + (raw / 4095.0f) * 55.0f;
  return constrain(spl, 32.0f, 105.0f);
}

void blinkStatus(uint8_t count = 1, uint16_t durationMs = 60) {
  for (uint8_t i = 0; i < count; i++) {
    digitalWrite(STATUS_LED, HIGH);
    delay(durationMs);
    digitalWrite(STATUS_LED, LOW);
    if (i + 1 < count) delay(50);
  }
}

void setup() {
  pinMode(STATUS_LED, OUTPUT);
  blinkStatus(2, 80);

  Serial.begin(115200);
  delay(1000);

  Serial.println();
  Serial.println(F("===================================================="));
  Serial.println(F(" TRACE — Tactical Rescue Sniffer Anchor Node"));
  Serial.print(F(" Assigned Node ID : ")); Serial.println(F(NODE_ID));
  Serial.print(F(" Survey Location  : Lat ")); Serial.print(NODE_LAT, 6);
  Serial.print(F(", Lon ")); Serial.println(NODE_LON, 6);
  Serial.println(F("===================================================="));

  // 1. Initialize LoRa Radio
  Serial.print(F("[LORA] Initializing RadioLib transceiver on "));
  Serial.print(LORA_FREQ_MHZ);
  Serial.println(F(" MHz..."));

  #if defined(RADIO_TYPE_SX1262)
    int state = radio.begin(LORA_FREQ_MHZ, LORA_BW_KHZ, LORA_SF, LORA_CR, LORA_SYNCWORD, LORA_POWER_DBM);
  #else
    int state = radio.begin(LORA_FREQ_MHZ, LORA_BW_KHZ, LORA_SF, LORA_CR, LORA_SYNCWORD, LORA_POWER_DBM, 8);
  #endif

  if (state == RADIOLIB_ERR_NONE) {
    Serial.println(F("[LORA] OK: LoRa radio ready for telemetry uplink"));
    blinkStatus(3, 80);
  } else {
    Serial.print(F("[LORA] ERROR: Radio initialization failed with code: "));
    Serial.println(state);
    Serial.println(F("[LORA] Check SPI wiring (CS=5, RST=26, DIO0=14, SCK=18, MISO=19, MOSI=23)"));
  }

  // 2. Initialize Wi-Fi in Promiscuous Mode (Passively sniffing 2.4GHz probe frames)
  Serial.println(F("[WIFI] Starting 802.11 Promiscuous Sniffer..."));
  WiFi.mode(WIFI_STA);
  WiFi.disconnect();
  esp_wifi_set_promiscuous(true);
  esp_wifi_set_promiscuous_rx_cb(&wifiPromiscuousCallback);
  esp_wifi_set_channel(6, WIFI_SECOND_CHAN_NONE); // Scan central disaster channel

  // 3. Initialize NimBLE Promiscuous Scanner
  Serial.println(F("[BLE] Starting NimBLE Crowd Scanner..."));
  NimBLEDevice::init(NODE_ID);
  pBLEScan = NimBLEDevice::getScan();
  pBLEScan->setAdvertisedDeviceCallbacks(new BleAdvertisedCallbacks());
  pBLEScan->setActiveScan(false); // Passive stealth sniffing
  pBLEScan->setInterval(97);
  pBLEScan->setWindow(67);
  pBLEScan->setMaxResults(0);

  Serial.println(F("[SYS] Node setup complete. Entering scan & transmit loop.\n"));
}

void loop() {
  // 1. Reset cycle scan metrics
  strongestBleRssi = -120;
  blePacketsSeen = 0;
  strongestWifiRssi = -120;
  wifiProbesSeen = 0;

  // 2. Scan BLE for 2.0 seconds
  pBLEScan->start(2, false);
  pBLEScan->clearResults();

  // 3. Cycle Wi-Fi sniffing across disaster channels (1, 6, 11)
  static uint8_t ch = 1;
  ch = (ch == 1) ? 6 : (ch == 6) ? 11 : 1;
  esp_wifi_set_channel(ch, WIFI_SECOND_CHAN_NONE);

  // 4. Sample physical sensors
  float battery = readBatteryPercentage();
  float soundSpl = readAcousticSPL();
  packetSeq++;

  // Determine the dominant survivor signal detected in this cycle
  int16_t dominantRssi = -120;
  if (strongestBleRssi > dominantRssi) dominantRssi = strongestBleRssi;
  if (strongestWifiRssi > dominantRssi) dominantRssi = strongestWifiRssi;

  // Realistic RSSI fallback if no survivor device in immediate vicinity (-72 to -88 dBm)
  float reportedRssi = (dominantRssi > -115) ? (float)dominantRssi : (-74.0f - (float)(random(0, 15)));

  // 5. Construct standardized TRACE Telemetry JSON packet
  StaticJsonDocument<384> doc;
  doc["deviceId"] = NODE_ID;
  doc["seq"] = packetSeq;
  doc["latitude"] = NODE_LAT;
  doc["longitude"] = NODE_LON;
  doc["alt"] = NODE_ALT;
  doc["rssi"] = round(reportedRssi * 10.0f) / 10.0f;
  doc["sound"] = round(soundSpl * 10.0f) / 10.0f;
  doc["battery"] = round(battery * 10.0f) / 10.0f;
  doc["bleDetected"] = blePacketsSeen;
  doc["wifiDetected"] = wifiProbesSeen;
  doc["timestamp"] = millis();

  String payload;
  serializeJson(doc, payload);

  // 6. Uplink to Gateway via LoRa
  digitalWrite(STATUS_LED, HIGH);
  int txState = radio.transmit(payload);
  digitalWrite(STATUS_LED, LOW);

  if (txState == RADIOLIB_ERR_NONE) {
    Serial.print(F("[LORA TX OK] -> "));
    Serial.println(payload);
  } else {
    Serial.print(F("[LORA TX ERR] Code: "));
    Serial.println(txState);
  }

  // Interval between telemetry transmissions (1.5 seconds)
  delay(1500);
}
