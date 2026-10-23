import { createFileRoute } from "@tanstack/react-router";
import { KavachView } from "@/components/kavach/KavachPages";

export const Route = createFileRoute("/devices")({
  head: () => ({
    meta: [
      { title: "KAVACH — Devices & Calibration" },
      {
        name: "description",
        content:
          "KAVACH Devices & Calibration: Hardware gateway monitoring, sniffer diagnostics, and RF path-loss calibration wizard.",
      },
      { property: "og:title", content: "KAVACH — Devices & Calibration" },
      {
        property: "og:description",
        content: "Hardware connectivity, sensor diagnostics, and RF calibration for KAVACH.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => <KavachView view="devices" />,
});
