// Parallel-route layout for Products. The `modal` slot (@modal) renders the
// intercepted product editor over the list during in-app navigation; a direct
// visit / refresh of /dashboard/products/[id] renders the full-page editor.
export default function ProductsLayout({
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
