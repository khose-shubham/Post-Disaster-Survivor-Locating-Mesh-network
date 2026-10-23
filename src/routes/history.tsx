import { createFileRoute } from "@tanstack/react-router";
import { KavachView } from "@/components/kavach/KavachPages";

export const Route = createFileRoute("/history")({
  head: () => ({
    meta: [
      { title: "KAVACH — Incident History" },
      {
        name: "description",
        content:
          "KAVACH Incident History: Operational logs, past localization runs, calibration records, and reports.",
      },
      { property: "og:title", content: "KAVACH — Incident History" },
      {
        property: "og:description",
        content: "Incident management, operational event history, and data export for KAVACH.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => <KavachView view="history" />,
});
