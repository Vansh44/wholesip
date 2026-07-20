import { requireSectionAccess, getActingStoreId } from "../../lib/access";
import { getStoreSettingsForEditor } from "@/app/actions/store-settings";
import { fetchBlogTaxonomy } from "@/lib/blog-taxonomy";
import { BlogSettingsView } from "./blog-settings-view";

// Blog settings live WITH the blogs feature (not under /dashboard/settings):
// the customer-submission toggles plus this store's own categories & tags,
// which the blog editors offer instead of any hardcoded list.
export default async function BlogSettingsPage() {
  const access = await requireSectionAccess("blogs", "view");

  const storeId = await getActingStoreId();
  const [{ plan, settings }, taxonomy] = await Promise.all([
    getStoreSettingsForEditor("Blogs"),
    fetchBlogTaxonomy(storeId),
  ]);

  return (
    <BlogSettingsView
      plan={plan}
      initialSettings={settings}
      taxonomy={taxonomy}
      canManage={access.can("blogs", "manage")}
    />
  );
}
