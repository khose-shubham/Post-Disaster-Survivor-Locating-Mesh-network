import { createFileRoute } from "@tanstack/react-router";
import { KavachView } from "@/components/kavach/KavachPages";
export const Route = createFileRoute("/gateway")({
  head: () => ({
    meta: [
      { title: "KAVACH — Gateway Operations" },
      {
        name: "description",
        content:
          "KAVACH Gateway Operations: disaster-response research operations with clear simulation and hardware provenance.",
      },
      { property: "og:title", content: "KAVACH — Gateway Operations" },
      {
        property: "og:description",
        content: "Gateway Operations for Triangulated Rescue Aid via Crowd-Signal Estimation.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => <KavachView view="gateway" />,
});
