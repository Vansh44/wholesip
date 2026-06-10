import { requireSectionAccess } from "../lib/access";
import { MediaLibraryView } from "./media-library-view";

export default async function MediaDashboardPage() {
  await requireSectionAccess("media", "view");
  return <MediaLibraryView />;
}
