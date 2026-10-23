import { createFileRoute } from "@tanstack/react-router";
import { TraceView } from "@/components/kavach/TracePages";
export const Route = createFileRoute("/gateway")({
  head: () => ({
    meta: [
      { title: "TRACE — Gateway Operations" },
      {
        name: "description",
        content:
          "TRACE Gateway Operations: disaster-response research operations with clear simulation and hardware provenance.",
      },
      { property: "og:title", content: "TRACE — Gateway Operations" },
      {
        property: "og:description",
        content: "Gateway Operations for Triangulated Rescue Aid via Crowd-Signal Estimation.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => <TraceView view="gateway" />,
});
