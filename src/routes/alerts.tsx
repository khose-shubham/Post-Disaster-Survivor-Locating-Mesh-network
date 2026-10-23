import { createFileRoute } from "@tanstack/react-router";
import { KavachView } from "@/components/kavach/KavachPages";
export const Route = createFileRoute("/alerts")({
  head: () => ({
    meta: [
      { title: "KAVACH — Alert Queue" },
      {
        name: "description",
        content:
          "KAVACH Alert Queue: disaster-response research operations with clear simulation and hardware provenance.",
      },
      { property: "og:title", content: "KAVACH — Alert Queue" },
      {
        property: "og:description",
        content: "Alert Queue for Triangulated Rescue Aid via Crowd-Signal Estimation.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => <KavachView view="alerts" />,
});
