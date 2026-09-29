import { notFound } from "next/navigation";

/** Unknown paths under /en or /fr render the localized not-found page inside the site layout. */
export default function CatchAll() {
  notFound();
}
