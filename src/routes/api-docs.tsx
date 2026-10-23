import { createFileRoute } from "@tanstack/react-router";
import { KavachView } from "@/components/kavach/KavachPages";
export const Route = createFileRoute("/api-docs")({
  head: () => ({
    meta: [
      { title: "KAVACH — API Documentation" },
      {
        name: "description",
        content:
          "KAVACH API Documentation: disaster-response research operations with clear simulation and hardware provenance.",
      },
      { property: "og:title", content: "KAVACH — API Documentation" },
      {
        property: "og:description",
        content: "API Documentation for Triangulated Rescue Aid via Crowd-Signal Estimation.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => <KavachView view="api" />,
});
