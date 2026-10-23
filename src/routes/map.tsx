import { createFileRoute } from "@tanstack/react-router";
import { TraceView } from "@/components/kavach/TracePages";
export const Route = createFileRoute("/map")({
  head: () => ({
    meta: [
      { title: "TRACE — Live Tactical Map" },
      {
        name: "description",
        content:
          "TRACE Live Tactical Map: disaster-response research operations with clear simulation and hardware provenance.",
      },
      { property: "og:title", content: "TRACE — Live Tactical Map" },
      {
        property: "og:description",
        content: "Live Tactical Map for Triangulated Rescue Aid via Crowd-Signal Estimation.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => <TraceView view="map" />,
});
