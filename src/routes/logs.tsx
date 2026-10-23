import { createFileRoute } from "@tanstack/react-router";
import { KavachView } from "@/components/kavach/KavachPages";
export const Route = createFileRoute("/logs")({
  head: () => ({
    meta: [
      { title: "KAVACH — Event Logs" },
      {
        name: "description",
        content:
          "KAVACH Event Logs: disaster-response research operations with clear simulation and hardware provenance.",
      },
      { property: "og:title", content: "KAVACH — Event Logs" },
      {
        property: "og:description",
        content: "Event Logs for Triangulated Rescue Aid via Crowd-Signal Estimation.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => <KavachView view="logs" />,
});
