import { createFileRoute } from "@tanstack/react-router";
import { KavachView } from "@/components/kavach/KavachPages";

export const Route = createFileRoute("/survivors")({
  head: () => ({
    meta: [
      { title: "KAVACH — Survivor Intelligence" },
      {
        name: "description",
        content:
          "KAVACH Survivor Intelligence: evidence-based classification of possible, confirmed, and rescued casualties with multi-device awareness.",
      },
      { property: "og:title", content: "KAVACH — Survivor Intelligence" },
      {
        property: "og:description",
        content: "Survivor Intelligence for Triangulated Rescue Aid via Crowd-Signal Estimation.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => <KavachView view="survivors" />,
});
