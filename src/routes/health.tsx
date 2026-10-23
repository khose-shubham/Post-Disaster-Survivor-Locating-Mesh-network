import { createFileRoute } from "@tanstack/react-router";
import { KavachView } from "@/components/kavach/KavachPages";
export const Route = createFileRoute("/health")({
  head: () => ({
    meta: [
      { title: "KAVACH — System Health" },
      {
        name: "description",
        content:
          "KAVACH System Health: disaster-response research operations with clear simulation and hardware provenance.",
      },
      { property: "og:title", content: "KAVACH — System Health" },
      {
        property: "og:description",
        content: "System Health for Triangulated Rescue Aid via Crowd-Signal Estimation.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => <KavachView view="health" />,
});
