import { createFileRoute } from "@tanstack/react-router";
import { TraceView } from "@/components/kavach/TracePages";
export const Route = createFileRoute("/incidents")({
  head: () => ({
    meta: [
      { title: "TRACE — Incident Management" },
      {
        name: "description",
        content:
          "TRACE Incident Management: disaster-response research operations with clear simulation and hardware provenance.",
      },
      { property: "og:title", content: "TRACE — Incident Management" },
      {
        property: "og:description",
        content: "Incident Management for Triangulated Rescue Aid via Crowd-Signal Estimation.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => <TraceView view="incidents" />,
});
