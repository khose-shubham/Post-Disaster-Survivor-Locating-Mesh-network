import { createFileRoute } from "@tanstack/react-router";
import { TraceView } from "@/components/kavach/TracePages";

export const Route = createFileRoute("/calibration")({
  head: () => ({
    meta: [
      { title: "TRACE — RF Path-Loss Calibration" },
      {
        name: "description",
        content:
          "TRACE RF Path-Loss Calibration Wizard: 4-step linear regression solver (A0, n, RMSE, R²), sample collection, and profile management.",
      },
      { property: "og:title", content: "TRACE — RF Path-Loss Calibration" },
      {
        property: "og:description",
        content:
          "Mathematical RF calibration and propagation modeling for TRACE disaster response.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => <TraceView view="calibration" />,
});
