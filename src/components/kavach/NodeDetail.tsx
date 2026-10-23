import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Metric, StatusDot, ago, fmtDateTime } from "./common";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { rssiToDistance } from "@/lib/kavach/engine";
import type { CalibrationSettings, SensorNode } from "@/lib/kavach/types";

export function NodeDetail({
  node,
  calibration,
  open,
  onOpenChange,
}: {
  node: SensorNode | null;
  calibration: CalibrationSettings;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        {node && (
          <>
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2">
                {node.id}
                <StatusDot status={node.status} />
              </SheetTitle>
              <SheetDescription>{node.label}</SheetDescription>
            </SheetHeader>

            <div className="mt-5 space-y-5">
              <div>
                <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">
                  Battery
                </p>
                <Progress value={node.battery} className="h-2" />
                <p className="mono-num mt-1 text-xs text-muted-foreground">
                  {node.battery.toFixed(1)} % · 18650 Li-ion via TP4056
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Metric label="Latitude" value={node.lat.toFixed(6)} unit="°N" />
                <Metric label="Longitude" value={node.lon.toFixed(6)} unit="°E" />
                <Metric label="Strongest RSSI" value={node.rssi.toFixed(0)} unit="dBm" />
                <Metric
                  label="Est. distance"
                  value={rssiToDistance(node.rssi, calibration).toFixed(1)}
                  unit="m"
                />
                <Metric label="Sound" value={node.sound.toFixed(1)} unit="dB" />
                <Metric label="Vibration" value={node.vibration.toFixed(3)} unit="g" />
                <Metric label="Thermal max" value={node.temperature.toFixed(1)} unit="°C" />
                <Metric label="Mesh hops" value={node.hops} />
                <Metric label="LoRa RSSI" value={node.loraRssi.toFixed(0)} unit="dBm" />
                <Metric label="LoRa SNR" value={node.loraSnr.toFixed(1)} unit="dB" />
                <Metric label="BLE devices" value={node.bleDetected} />
                <Metric label="Wi-Fi devices" value={node.wifiDetected} />
              </div>

              <div>
                <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">
                  Sensor health
                </p>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(node.sensorHealth).map(([k, v]) => (
                    <Badge
                      key={k}
                      variant="outline"
                      className={
                        v === "ok"
                          ? "border-success/40 bg-success/10 text-success"
                          : v === "warn"
                            ? "border-warning/40 bg-warning/10 text-warning"
                            : "border-critical/40 bg-critical/10 text-critical"
                      }
                    >
                      {k}: {v}
                    </Badge>
                  ))}
                </div>
              </div>

              <p className="text-xs text-muted-foreground">
                Last packet {fmtDateTime(node.lastPacket)} ({ago(node.lastPacket)})
              </p>
              <p className="rounded-md border border-border bg-secondary/40 p-3 text-xs text-muted-foreground">
                Wireless observations are supporting evidence only. Device identifiers are
                anonymised as temporary IDs; presence of a device does not confirm a survivor.
              </p>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
