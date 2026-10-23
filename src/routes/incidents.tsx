import { createFileRoute } from "@tanstack/react-router";
import { KavachView } from "@/components/kavach/KavachPages";
export const Route = createFileRoute("/incidents")({
  head: () => ({
    meta: [
      { title: "KAVACH — Incident Management" },
      {
        name: "description",
        content:
          "KAVACH Incident Management: disaster-response research operations with clear simulation and hardware provenance.",
      },
      { property: "og:title", content: "KAVACH — Incident Management" },
      {
        property: "og:description",
        content: "Incident Management for Triangulated Rescue Aid via Crowd-Signal Estimation.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => <KavachView view="incidents" />,
});
