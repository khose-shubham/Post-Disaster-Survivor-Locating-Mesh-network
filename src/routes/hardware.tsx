import { createFileRoute } from "@tanstack/react-router";
import { TraceView } from "@/components/kavach/TracePages";
export const Route = createFileRoute("/hardware")({
  head: () => ({
    meta: [
      { title: "TRACE — Hardware Integration" },
      {
        name: "description",
        content:
          "TRACE Hardware Integration: disaster-response research operations with clear simulation and hardware provenance.",
      },
      { property: "og:title", content: "TRACE — Hardware Integration" },
      {
        property: "og:description",
        content: "Hardware Integration for Triangulated Rescue Aid via Crowd-Signal Estimation.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => <TraceView view="hardware" />,
});
