import { createFileRoute } from "@tanstack/react-router";
import { KavachView } from "@/components/kavach/KavachPages";
export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "KAVACH — Platform Settings" },
      {
        name: "description",
        content:
          "KAVACH Platform Settings: disaster-response research operations with clear simulation and hardware provenance.",
      },
      { property: "og:title", content: "KAVACH — Platform Settings" },
      {
        property: "og:description",
        content: "Platform Settings for Triangulated Rescue Aid via Crowd-Signal Estimation.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => <KavachView view="settings" />,
});
