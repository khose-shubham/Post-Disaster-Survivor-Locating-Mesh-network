import { createFileRoute } from "@tanstack/react-router";
import { TraceView } from "@/components/kavach/TracePages";
export const Route = createFileRoute("/alerts")({
  head: () => ({
    meta: [
      { title: "TRACE — Alert Queue" },
      {
        name: "description",
        content:
          "TRACE Alert Queue: disaster-response research operations with clear simulation and hardware provenance.",
      },
      { property: "og:title", content: "TRACE — Alert Queue" },
      {
        property: "og:description",
        content: "Alert Queue for Triangulated Rescue Aid via Crowd-Signal Estimation.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => <TraceView view="alerts" />,
});
