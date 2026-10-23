import { createFileRoute } from "@tanstack/react-router";
import { KavachView } from "@/components/kavach/KavachPages";

export const Route = createFileRoute("/operations")({
  head: () => ({
    meta: [
      { title: "KAVACH — Rescue Operations" },
      {
        name: "description",
        content:
          "KAVACH Rescue Operations: tracking search operations, response timelines, and auditable status transitions.",
      },
      { property: "og:title", content: "KAVACH — Rescue Operations" },
      {
        property: "og:description",
        content:
          "Rescue Operations tracking for Triangulated Rescue Aid via Crowd-Signal Estimation.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => <KavachView view="operations" />,
});
