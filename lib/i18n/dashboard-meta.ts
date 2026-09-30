import type { Metadata } from "next";

import { getMessages, type Messages } from "./dictionaries";

/** `export const generateMetadata = dashboardMetadata((d) => d.products.title);` (robots are set by the dashboard layout). */
export const dashboardMetadata =
  (pick: (d: Messages["dashboard"]) => string) =>
  async (): Promise<Metadata> => ({ title: pick((await getMessages()).dashboard) });
