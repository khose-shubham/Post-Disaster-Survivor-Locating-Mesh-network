import { createFileRoute } from "@tanstack/react-router";
import { KavachView } from "@/components/kavach/KavachPages";
export const Route = createFileRoute("/analytics")({
  head: () => ({
    meta: [
      { title: "KAVACH — Operational Analytics" },
      {
        name: "description",
        content:
          "KAVACH Operational Analytics: disaster-response research operations with clear simulation and hardware provenance.",
      },
      { property: "og:title", content: "KAVACH — Operational Analytics" },
      {
        property: "og:description",
        content: "Operational Analytics for Triangulated Rescue Aid via Crowd-Signal Estimation.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => <KavachView view="analytics" />,
});
