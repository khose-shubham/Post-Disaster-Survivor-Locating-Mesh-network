import { createFileRoute } from "@tanstack/react-router";
import { KavachView } from "@/components/kavach/KavachPages";
export const Route = createFileRoute("/nodes")({
  head: () => ({
    meta: [
      { title: "KAVACH — Sensor Nodes" },
      {
        name: "description",
        content:
          "KAVACH Sensor Nodes: disaster-response research operations with clear simulation and hardware provenance.",
      },
      { property: "og:title", content: "KAVACH — Sensor Nodes" },
      {
        property: "og:description",
        content: "Sensor Nodes for Triangulated Rescue Aid via Crowd-Signal Estimation.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => <KavachView view="nodes" />,
});
