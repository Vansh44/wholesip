import { getStoreBrand } from "@/lib/store/brand";
import EnquiriesForm from "./enquiries-form";

// Per-store metadata (layout templates the title as "%s | {brand}").
export async function generateMetadata() {
  const brand = await getStoreBrand();
  return {
    title: "Get in touch",
    description: `Have a question or suggestion? Send the ${brand.name} team an enquiry and we'll get back to you soon.`,
  };
}

export default function Enquiries() {
  return <EnquiriesForm />;
}
