import { createFileRoute } from "@tanstack/react-router";
import { TraceView } from "@/components/kavach/TracePages";
export const Route = createFileRoute("/health")({
  head: () => ({
    meta: [
      { title: "TRACE — System Health" },
      {
        name: "description",
        content:
          "TRACE System Health: disaster-response research operations with clear simulation and hardware provenance.",
      },
      { property: "og:title", content: "TRACE — System Health" },
      {
        property: "og:description",
        content: "System Health for Triangulated Rescue Aid via Crowd-Signal Estimation.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => <TraceView view="health" />,
});
