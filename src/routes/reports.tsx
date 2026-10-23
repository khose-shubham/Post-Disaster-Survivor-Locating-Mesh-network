import { createFileRoute } from "@tanstack/react-router";
import { KavachView } from "@/components/kavach/KavachPages";
export const Route = createFileRoute("/reports")({
  head: () => ({
    meta: [
      { title: "KAVACH — Incident Reports" },
      {
        name: "description",
        content:
          "KAVACH Incident Reports: disaster-response research operations with clear simulation and hardware provenance.",
      },
      { property: "og:title", content: "KAVACH — Incident Reports" },
      {
        property: "og:description",
        content: "Incident Reports for Triangulated Rescue Aid via Crowd-Signal Estimation.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => <KavachView view="reports" />,
});
