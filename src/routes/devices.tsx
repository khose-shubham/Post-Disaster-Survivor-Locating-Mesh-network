import { createFileRoute } from "@tanstack/react-router";
import { TraceView } from "@/components/kavach/TracePages";

export const Route = createFileRoute("/devices")({
  head: () => ({
    meta: [
      { title: "TRACE — Devices & Calibration" },
      {
        name: "description",
        content:
          "TRACE Devices & Calibration: Hardware gateway monitoring, sniffer diagnostics, and RF path-loss calibration wizard.",
      },
      { property: "og:title", content: "TRACE — Devices & Calibration" },
      {
        property: "og:description",
        content: "Hardware connectivity, sensor diagnostics, and RF calibration for TRACE.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => <TraceView view="devices" />,
});
