import { createFileRoute } from "@tanstack/react-router";
import { KavachView } from "@/components/kavach/KavachPages";

export const Route = createFileRoute("/calibration")({
  head: () => ({
    meta: [
      { title: "KAVACH — RF Path-Loss Calibration" },
      {
        name: "description",
        content:
          "KAVACH RF Path-Loss Calibration Wizard: 4-step linear regression solver (A0, n, RMSE, R²), sample collection, and profile management.",
      },
      { property: "og:title", content: "KAVACH — RF Path-Loss Calibration" },
      {
        property: "og:description",
        content:
          "Mathematical RF calibration and propagation modeling for KAVACH disaster response.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => <KavachView view="calibration" />,
});
