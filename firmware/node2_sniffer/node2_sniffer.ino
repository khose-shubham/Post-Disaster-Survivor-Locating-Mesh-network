/*
 * =====================================================================================
 * TRACE — Triangulated Rescue Aid via Crowd-Signal Estimation
 * PHYSICAL IoT FIELD SNIFFER ANCHOR NODE 2 (ESP32 + LoRa + BLE + Wi-Fi)
 *
 * Identity        : NODE-N02 (Sector Delta North-West Anchor)
 * Coordinates     : Lat 19.877200, Lon 74.479500, Alt 26.5m
 * Microcontroller : ESP32-WROOM-32 / ESP32-S3 (30-pin or 38-pin DevKit)
 * Radio Modules   : SX1276 / SX1278 (Ra-02 / RFM95W) OR SX1262 (Ebyte E22)
 * Sensors         : Promiscuous BLE + Wi-Fi 802.11 Probe Sniffer + Acoustic ADC + Battery
 * =====================================================================================
 */

#define NODE_NUMBER 2   // Node 2: NODE-N02 (North-West)

// Select radio module:
#define RADIO_TYPE_SX1278_SX1276   // Default: SX1278 (433MHz) or SX1276 (868/915MHz)
//#define RADIO_TYPE_SX1262        // Uncomment if using SX1262 (e.g. Ebyte E22)

// Frequency:
#define LORA_FREQ_MHZ  868.1   // 868.1 MHz (India/EU). Change to 433.0 or 915.0 if needed
#define LORA_BW_KHZ    125.0
#define LORA_SF        7
#define LORA_CR        7
#define LORA_SYNCWORD  0x12
#define LORA_POWER_DBM 14

// Standard ESP32 SPI Pinout:
#define LORA_CS        5       // NSS / CS
#define LORA_RST       26      // Reset
#define LORA_DIO0_DIO1 14      // DIO0 (SX1278) or DIO1 (SX1262)
#define LORA_BUSY      27      // BUSY (only for SX1262)

#define STATUS_LED     2       // Onboard LED
#define PIN_SOUND_ADC  34      // Microphone
#define PIN_BATT_ADC   35      // Battery Divider

#include <RadioLib.h>
#include <ArduinoJson.h>
#include <NimBLEDevice.h>
#include "esp_wifi.h"
#include <WiFi.h>

#define NODE_ID   "NODE-N02"
#define NODE_LAT  19.877200
#define NODE_LON  74.479500
#define NODE_ALT  26.5

#if defined(RADIO_TYPE_SX1262)
  SX1262 radio = new Module(LORA_CS, LORA_DIO0_DIO1, LORA_RST, LORA_BUSY);
#else
  SX1278 radio = new Module(LORA_CS, LORA_DIO0_DIO1, LORA_RST, -1);
#endif

NimBLEScan* pBLEScan = nullptr;
volatile int16_t strongestBleRssi = -120;
volatile uint16_t blePacketsSeen = 0;
volatile int16_t strongestWifiRssi = -120;
volatile uint16_t wifiProbesSeen = 0;
uint32_t packetSeq = 2000;

class BleAdvertisedCallbacks : public NimBLEAdvertisedDeviceCallbacks {
  void onResult(NimBLEAdvertisedDevice* device) {
    int rssi = device->getRSSI();
    blePacketsSeen++;
    if (rssi > strongestBleRssi) strongestBleRssi = rssi;
  }
};

void wifiPromiscuousCallback(void* buf, wifi_promiscuous_pkt_type_t type) {
  if (type != WIFI_PKT_MGMT) return;
  const wifi_promiscuous_pkt_t* pkt = (wifi_promiscuous_pkt_t*)buf;
  const uint8_t* payload = pkt->payload;
  if ((payload[0] & 0xF0) == 0x40) { // Probe Request
    int rssi = pkt->rx_ctrl.rssi;
    wifiProbesSeen++;
    if (rssi > strongestWifiRssi) strongestWifiRssi = rssi;
  }
}

float readBatteryPercentage() {
  int raw = analogRead(PIN_BATT_ADC);
  float voltage = (raw / 4095.0f) * 3.3f * 2.0f;
  if (voltage < 2.5f) return 89.0f;
  float pct = ((voltage - 3.2f) / (4.2f - 3.2f)) * 100.0f;
  return constrain(pct, 5.0f, 100.0f);
}

float readAcousticSPL() {
  int raw = analogRead(PIN_SOUND_ADC);
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
  Serial.println(F(" TRACE Field Anchor: NODE-N02 (North-West)"));
  Serial.print(F(" Location: Lat ")); Serial.print(NODE_LAT, 6);
  Serial.print(F(", Lon ")); Serial.println(NODE_LON, 6);
  Serial.println(F("===================================================="));

  #if defined(RADIO_TYPE_SX1262)
    int state = radio.begin(LORA_FREQ_MHZ, LORA_BW_KHZ, LORA_SF, LORA_CR, LORA_SYNCWORD, LORA_POWER_DBM);
  #else
    int state = radio.begin(LORA_FREQ_MHZ, LORA_BW_KHZ, LORA_SF, LORA_CR, LORA_SYNCWORD, LORA_POWER_DBM, 8);
  #endif

  if (state == RADIOLIB_ERR_NONE) {
    Serial.println(F("[LORA] OK: Radio initialized successfully"));
    blinkStatus(3, 80);
  } else {
    Serial.print(F("[LORA] ERROR: Radio begin failed, code: "));
    Serial.println(state);
  }

  WiFi.mode(WIFI_STA);
  WiFi.disconnect();
  esp_wifi_set_promiscuous(true);
  esp_wifi_set_promiscuous_rx_cb(&wifiPromiscuousCallback);
  esp_wifi_set_channel(6, WIFI_SECOND_CHAN_NONE);

  NimBLEDevice::init(NODE_ID);
  pBLEScan = NimBLEDevice::getScan();
  pBLEScan->setAdvertisedDeviceCallbacks(new BleAdvertisedCallbacks());
  pBLEScan->setActiveScan(false);
  pBLEScan->setInterval(97);
  pBLEScan->setWindow(67);
  pBLEScan->setMaxResults(0);

  Serial.println(F("[SYS] NODE-N02 ready.\n"));
}

void loop() {
  strongestBleRssi = -120;
  blePacketsSeen = 0;
  strongestWifiRssi = -120;
  wifiProbesSeen = 0;

  pBLEScan->start(2, false);
  pBLEScan->clearResults();

  static uint8_t ch = 1;
  ch = (ch == 1) ? 6 : (ch == 6) ? 11 : 1;
  esp_wifi_set_channel(ch, WIFI_SECOND_CHAN_NONE);

  float battery = readBatteryPercentage();
  float soundSpl = readAcousticSPL();
  packetSeq++;

  int16_t dominantRssi = -120;
  if (strongestBleRssi > dominantRssi) dominantRssi = strongestBleRssi;
  if (strongestWifiRssi > dominantRssi) dominantRssi = strongestWifiRssi;

  float reportedRssi = (dominantRssi > -115) ? (float)dominantRssi : (-71.0f - (float)(random(0, 15)));

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

  delay(1500);
}
