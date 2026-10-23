import { createFileRoute } from "@tanstack/react-router";
import { KavachView } from "@/components/kavach/KavachPages";
export const Route = createFileRoute("/topology")({
  head: () => ({
    meta: [
      { title: "KAVACH — Network Topology" },
      {
        name: "description",
        content:
          "KAVACH Network Topology: disaster-response research operations with clear simulation and hardware provenance.",
      },
      { property: "og:title", content: "KAVACH — Network Topology" },
      {
        property: "og:description",
        content: "Network Topology for Triangulated Rescue Aid via Crowd-Signal Estimation.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => <KavachView view="topology" />,
});
