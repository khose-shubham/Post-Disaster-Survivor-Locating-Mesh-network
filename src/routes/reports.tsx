import { createFileRoute } from "@tanstack/react-router";
import { TraceView } from "@/components/kavach/TracePages";
export const Route = createFileRoute("/reports")({
  head: () => ({
    meta: [
      { title: "TRACE — Incident Reports" },
      {
        name: "description",
        content:
          "TRACE Incident Reports: disaster-response research operations with clear simulation and hardware provenance.",
      },
      { property: "og:title", content: "TRACE — Incident Reports" },
      {
        property: "og:description",
        content: "Incident Reports for Triangulated Rescue Aid via Crowd-Signal Estimation.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => <TraceView view="reports" />,
});
