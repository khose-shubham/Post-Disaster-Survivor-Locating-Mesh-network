import { createFileRoute } from "@tanstack/react-router";
import { TraceView } from "@/components/kavach/TracePages";
export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "TRACE — Disaster Response Command" },
      {
        name: "description",
        content:
          "TRACE rescue command: anonymous signal estimation, tactical local map and clearly labeled disaster-response simulation.",
      },
      { property: "og:title", content: "TRACE — Disaster Response Command" },
      {
        property: "og:description",
        content:
          "Triangulated Rescue Aid via Crowd-Signal Estimation. Tactical disaster-response search operations platform.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => <TraceView view="overview" />,
});
