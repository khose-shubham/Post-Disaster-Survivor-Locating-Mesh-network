import { createFileRoute } from "@tanstack/react-router";
import { TraceView } from "@/components/kavach/TracePages";
export const Route = createFileRoute("/nodes")({
  head: () => ({
    meta: [
      { title: "TRACE — Sensor Nodes" },
      {
        name: "description",
        content:
          "TRACE Sensor Nodes: disaster-response research operations with clear simulation and hardware provenance.",
      },
      { property: "og:title", content: "TRACE — Sensor Nodes" },
      {
        property: "og:description",
        content: "Sensor Nodes for Triangulated Rescue Aid via Crowd-Signal Estimation.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => <TraceView view="nodes" />,
});
