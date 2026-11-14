import { redirect } from "next/navigation";

// The regulation moved to the public /cas-rating (v2.55.0); the admin tab
// opens the calculation + settings.
export default function AdminCasRatingRedirect() {
  redirect("/admin/cas-rating/live");
}
