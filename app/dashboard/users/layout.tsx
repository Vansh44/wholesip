// Parallel-route layout for the Users section. The `modal` slot (@modal)
// renders the intercepted customer detail dialog over the list during in-app
// navigation; on a direct visit / refresh of /dashboard/users/[id] the slot
// falls back to its default (null) and the [id] page renders full-page instead.
export default function UsersLayout({
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
