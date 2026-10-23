import { createFileRoute } from "@tanstack/react-router";
import { TraceView } from "@/components/kavach/TracePages";

export const Route = createFileRoute("/history")({
  head: () => ({
    meta: [
      { title: "TRACE — Incident History" },
      {
        name: "description",
        content:
          "TRACE Incident History: Operational logs, past localization runs, calibration records, and reports.",
      },
      { property: "og:title", content: "TRACE — Incident History" },
      {
        property: "og:description",
        content: "Incident management, operational event history, and data export for TRACE.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => <TraceView view="history" />,
});
