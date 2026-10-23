import { createFileRoute } from "@tanstack/react-router";
import { KavachView } from "@/components/kavach/KavachPages";
export const Route = createFileRoute("/simulation")({
  head: () => ({
    meta: [
      { title: "KAVACH — Simulation Lab" },
      {
        name: "description",
        content:
          "KAVACH Simulation Lab: disaster-response research operations with clear simulation and hardware provenance.",
      },
      { property: "og:title", content: "KAVACH — Simulation Lab" },
      {
        property: "og:description",
        content: "Simulation Lab for Triangulated Rescue Aid via Crowd-Signal Estimation.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => <KavachView view="simulation" />,
});
