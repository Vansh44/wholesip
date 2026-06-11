import { redirect } from "next/navigation";

// Marketing currently surfaces a single tool — coupons. Land there directly.
export default function MarketingPage() {
  redirect("/dashboard/marketing/coupons");
}
