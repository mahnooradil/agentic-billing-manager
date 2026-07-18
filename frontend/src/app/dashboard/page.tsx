import { redirect } from "next/navigation";

/** /dashboard has no page of its own — send users to the overview. */
export default function DashboardIndex() {
  redirect("/dashboard/overview");
}
