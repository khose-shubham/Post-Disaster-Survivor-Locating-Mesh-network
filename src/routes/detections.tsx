import { createFileRoute } from "@tanstack/react-router";
import { TraceView } from "@/components/kavach/TracePages";
export const Route = createFileRoute("/detections")({
  head: () => ({
    meta: [
      { title: "TRACE — Signal Detections" },
      {
        name: "description",
        content:
          "TRACE Signal Detections: disaster-response research operations with clear simulation and hardware provenance.",
      },
      { property: "og:title", content: "TRACE — Signal Detections" },
      {
        property: "og:description",
        content: "Signal Detections for Triangulated Rescue Aid via Crowd-Signal Estimation.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => <TraceView view="detections" />,
});
