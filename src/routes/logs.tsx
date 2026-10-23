import { createFileRoute } from "@tanstack/react-router";
import { TraceView } from "@/components/kavach/TracePages";
export const Route = createFileRoute("/logs")({
  head: () => ({
    meta: [
      { title: "TRACE — Event Logs" },
      {
        name: "description",
        content:
          "TRACE Event Logs: disaster-response research operations with clear simulation and hardware provenance.",
      },
      { property: "og:title", content: "TRACE — Event Logs" },
      {
        property: "og:description",
        content: "Event Logs for Triangulated Rescue Aid via Crowd-Signal Estimation.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => <TraceView view="logs" />,
});
