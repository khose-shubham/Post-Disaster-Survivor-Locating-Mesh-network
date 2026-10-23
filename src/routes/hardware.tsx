import { createFileRoute } from "@tanstack/react-router";
import { KavachView } from "@/components/kavach/KavachPages";
export const Route = createFileRoute("/hardware")({
  head: () => ({
    meta: [
      { title: "KAVACH — Hardware Integration" },
      {
        name: "description",
        content:
          "KAVACH Hardware Integration: disaster-response research operations with clear simulation and hardware provenance.",
      },
      { property: "og:title", content: "KAVACH — Hardware Integration" },
      {
        property: "og:description",
        content: "Hardware Integration for Triangulated Rescue Aid via Crowd-Signal Estimation.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => <KavachView view="hardware" />,
});
