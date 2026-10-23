import { createFileRoute } from "@tanstack/react-router";
import { TraceView } from "@/components/kavach/TracePages";
export const Route = createFileRoute("/simulation")({
  head: () => ({
    meta: [
      { title: "TRACE — Simulation Lab" },
      {
        name: "description",
        content:
          "TRACE Simulation Lab: disaster-response research operations with clear simulation and hardware provenance.",
      },
      { property: "og:title", content: "TRACE — Simulation Lab" },
      {
        property: "og:description",
        content: "Simulation Lab for Triangulated Rescue Aid via Crowd-Signal Estimation.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => <TraceView view="simulation" />,
});
