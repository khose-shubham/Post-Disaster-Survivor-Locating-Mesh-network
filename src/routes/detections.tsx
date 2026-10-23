import { createFileRoute } from "@tanstack/react-router";
import { KavachView } from "@/components/kavach/KavachPages";
export const Route = createFileRoute("/detections")({
  head: () => ({
    meta: [
      { title: "KAVACH — Signal Detections" },
      {
        name: "description",
        content:
          "KAVACH Signal Detections: disaster-response research operations with clear simulation and hardware provenance.",
      },
      { property: "og:title", content: "KAVACH — Signal Detections" },
      {
        property: "og:description",
        content: "Signal Detections for Triangulated Rescue Aid via Crowd-Signal Estimation.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => <KavachView view="detections" />,
});
