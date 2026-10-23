import { createFileRoute } from "@tanstack/react-router";
import { TraceView } from "@/components/kavach/TracePages";
export const Route = createFileRoute("/api-docs")({
  head: () => ({
    meta: [
      { title: "TRACE — API Documentation" },
      {
        name: "description",
        content:
          "TRACE API Documentation: disaster-response research operations with clear simulation and hardware provenance.",
      },
      { property: "og:title", content: "TRACE — API Documentation" },
      {
        property: "og:description",
        content: "API Documentation for Triangulated Rescue Aid via Crowd-Signal Estimation.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => <TraceView view="api" />,
});
