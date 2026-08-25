Post-disaster survivor-locating mesh network 

 # Frontend/Dashboard

Project context (what the full system does):
When a disaster hits — earthquake, building collapse, flood — phone towers usually go down too, so rescue teams can't call survivors and survivors can't call for help. Right now, rescuers physically search through rubble, which is slow. This project addresses that by dropping small sensor devices into a disaster area by drone. These sensors passively detect the WiFi/Bluetooth signals phones emit automatically, and triangulate a rough location once 3+ sensors detect the same phone — shown on a live map so rescuers get a "search here" zone instead of searching blindly.

My contribution — the dashboard:
I built the live command dashboard that rescue teams would view. It's designed to take detection data (from the sensor network) and present it clearly and safely for field use.

Dashboard features:

Live map showing sensor positions and detected signal zones, updating in real time
Confidence circles instead of fake-exact pins — bigger circle means less certain location, so rescuers aren't misled into treating a rough estimate as precise
Freshness color-coding — recent detections shown urgently (red), aging ones fade (amber)
Signal table listing every active detection with position, confidence, and number of sensors that see it
Node status panel showing sensor placement
Clear connection-loss warning, so "no survivors detected" never looks the same as "system malfunction"
Command-center visual design — dark, high-contrast, built for glanceability on a shared screen

Technologies I used (frontend):

React — component-based interface (map, table, status panel)
Tailwind CSS — styling
SVG/Canvas — rendering the live map directly in-browser
Fetch API polling — pulling live data from the backend every second

Technologies used elsewhere in the full system (not built by me):

ESP32 microcontrollers, WiFi/BLE sniffing, LoRa radio (SX1276) — sensor hardware layer
Python/Flask + SciPy trilateration — backend that computes survivor position
