import { createFileRoute } from "@tanstack/react-router";
import { KavachView } from "@/components/kavach/KavachPages";
export const Route = createFileRoute("/map")({
  head: () => ({
    meta: [
      { title: "KAVACH — Live Tactical Map" },
      {
        name: "description",
        content:
          "KAVACH Live Tactical Map: disaster-response research operations with clear simulation and hardware provenance.",
      },
      { property: "og:title", content: "KAVACH — Live Tactical Map" },
      {
        property: "og:description",
        content: "Live Tactical Map for Triangulated Rescue Aid via Crowd-Signal Estimation.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => <KavachView view="map" />,
});
