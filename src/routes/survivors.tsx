import { createFileRoute } from "@tanstack/react-router";
import { TraceView } from "@/components/kavach/TracePages";

export const Route = createFileRoute("/survivors")({
  head: () => ({
    meta: [
      { title: "TRACE — Survivor Intelligence" },
      {
        name: "description",
        content:
          "TRACE Survivor Intelligence: evidence-based classification of possible, confirmed, and rescued casualties with multi-device awareness.",
      },
      { property: "og:title", content: "TRACE — Survivor Intelligence" },
      {
        property: "og:description",
        content: "Survivor Intelligence for Triangulated Rescue Aid via Crowd-Signal Estimation.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => <TraceView view="survivors" />,
});
