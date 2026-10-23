import { createFileRoute } from "@tanstack/react-router";
import { KavachView } from "@/components/kavach/KavachPages";
export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "KAVACH — Disaster Response Command" },
      {
        name: "description",
        content:
          "KAVACH rescue command: anonymous signal estimation, tactical local map and clearly labeled disaster-response simulation.",
      },
      { property: "og:title", content: "KAVACH — Disaster Response Command" },
      {
        property: "og:description",
        content:
          "Triangulated Rescue Aid via Crowd-Signal Estimation. Tactical disaster-response search operations platform.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => <KavachView view="overview" />,
});
