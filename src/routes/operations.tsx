import { createFileRoute } from "@tanstack/react-router";
import { TraceView } from "@/components/kavach/TracePages";

export const Route = createFileRoute("/operations")({
  head: () => ({
    meta: [
      { title: "TRACE — Rescue Operations" },
      {
        name: "description",
        content:
          "TRACE Rescue Operations: tracking search operations, response timelines, and auditable status transitions.",
      },
      { property: "og:title", content: "TRACE — Rescue Operations" },
      {
        property: "og:description",
        content:
          "Rescue Operations tracking for Triangulated Rescue Aid via Crowd-Signal Estimation.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => <TraceView view="operations" />,
});
