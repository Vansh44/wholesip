// Parallel-route layout for the Enquiries section. The `modal` slot (@modal)
// renders the intercepted detail dialog over the list during in-app navigation;
// on a direct visit / refresh of /dashboard/enquiries/[id] the slot falls back
// to its default (null) and the [id] page renders as a full page instead.
export default function EnquiriesLayout({
  children,
  modal,
}: {
  children: React.ReactNode;
  modal: React.ReactNode;
}) {
  return (
    <>
      {children}
      {modal}
    </>
  );
}
