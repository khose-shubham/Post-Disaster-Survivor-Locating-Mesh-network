/*
 * TRACE — Triangulated Rescue Aid via Crowd-Signal Estimation
 * Firmware: Reference RF Calibration & Test Casualty Beacon
 *
 * Microcontroller: ESP32-WROOM-32D / ESP32-C3 / ESP32-S3
 * Purpose: Emits continuous BLE advertising frames with fixed Tx power
 *          Used for empirical path-loss calibration (1m, 3m, 5m, 10m)
 *          and physical ground-truth localization field testing.
 */

#include <NimBLEDevice.h>

#define BEACON_NAME     "TRACE-BEACON-01"
#define ADVERT_INTERVAL 100 // 100ms advertising interval for rapid calibration sampling
#define TX_POWER_LEVEL  ESP_PWR_LVL_P3 // +3 dBm output power

NimBLEAdvertising* pAdvertising = nullptr;

void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println(F("TRACE Calibration & Test Beacon Initializing..."));

  // Set fixed RF output power for repeatable empirical calibration
  esp_ble_tx_power_set(ESP_BLE_PWR_TYPE_ADV, TX_POWER_LEVEL);

  NimBLEDevice::init(BEACON_NAME);
  pAdvertising = NimBLEDevice::getAdvertising();

  // Create standard BLE advertising payload
  NimBLEAdvertisementData advData;
  advData.setName(BEACON_NAME);
  advData.setCompleteServices(NimBLEUUID("180F")); // Standard Battery Service UUID
  advData.setFlags(0x06); // General Discoverable + BR/EDR Not Supported

  pAdvertising->setAdvertisementData(advData);
  pAdvertising->setMinInterval(ADVERT_INTERVAL);
  pAdvertising->setMaxInterval(ADVERT_INTERVAL + 20);

  pAdvertising->start();
  Serial.println(F("TRACE Beacon Broadcasting at +3 dBm (Active)."));
}

void loop() {
  // Beacon transmits autonomously via hardware BLE controller
  delay(5000);
  Serial.println(F("[BEACON HEARTBEAT] Broadcasting..."));
}
