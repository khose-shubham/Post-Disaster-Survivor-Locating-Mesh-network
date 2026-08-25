## Post-disaster-survivor-locating-mesh-network


# What your project does :

When a disaster hits — earthquake, building collapse, flood — the phone towers usually go down too. So rescue teams can't call survivors, and survivors can't call for help. Right now, rescuers just have to physically search through rubble, which is slow.

Your project fixes part of that problem. Most people trapped in rubble are still carrying a phone. Even with no signal, a phone still quietly "shouts" out looking for WiFi networks and Bluetooth devices — it does this on its own, without the person doing anything.

Your system drops small sensor devices into the disaster area (by drone). These devices listen for that quiet "shouting" from phones. Once 3 or more sensors hear the same phone, your system does some math to figure out roughly where that phone is — and shows it on a live map for rescue workers to see. So instead of searching blindly, rescuers get a rough "search here" zone.

# Features

- No internet or cell tower needed — the sensors talk to each other using their own radio network (LoRa), so it works even when everything else is down.
- Detects phones passively — doesn't need the survivor to do anything, install an app, or have signal bars. Just needs the phone to be powered on.
- Shows a "probability zone," not a fake-exact pin — since signals are noisy in rubble, your dashboard shows a circle (bigger circle = less sure), which is more honest and safer for rescuers than a misleading single dot.
- Privacy-friendly  — your sensors scramble (hash) the phone's ID the moment they detect it, so no one's actual phone identity is ever stored or sent anywhere.
- Live dashboard — a map that updates every second showing sensor positions and any detected survivor zones, plus a clear warning if the system itself loses connection (so no one confuses "no signal found" with "system broken").
- Cheap and deployable fast — built from low-cost parts (~₹1,500-2,500 per sensor), light enough to be air-dropped by drone into a disaster zone within minutes.

## Technologies used

- ESP32 microcontroller — the small computer chip inside each sensor that does the actual listening for phone signals.
- WiFi & Bluetooth sniffing — a mode built into the ESP32 that lets it "eavesdrop" on nearby phone signals without connecting to them.
- LoRa radio (SX1276 module) — a long-range, low-power radio system the sensors use to talk to each other and send data back, even from kilometers away.
- Python (Flask) — runs the "brain" on a laptop that receives all the readings and calculates where each phone likely is.
- Trilateration math (via SciPy)— the same kind of math GPS uses: if you know how far away something is from 3+ points, you can estimate its exact location.
- React / HTML dashboard — the live map interface that rescue teams actually look at, showing sensor locations and survivor zones in real time.
