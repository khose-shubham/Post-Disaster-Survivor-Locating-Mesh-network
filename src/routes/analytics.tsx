import { createFileRoute } from "@tanstack/react-router";
import { TraceView } from "@/components/kavach/TracePages";
export const Route = createFileRoute("/analytics")({
  head: () => ({
    meta: [
      { title: "TRACE — Operational Analytics" },
      {
        name: "description",
        content:
          "TRACE Operational Analytics: disaster-response research operations with clear simulation and hardware provenance.",
      },
      { property: "og:title", content: "TRACE — Operational Analytics" },
      {
        property: "og:description",
        content: "Operational Analytics for Triangulated Rescue Aid via Crowd-Signal Estimation.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => <TraceView view="analytics" />,
});
