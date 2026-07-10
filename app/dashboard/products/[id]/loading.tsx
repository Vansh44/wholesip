// Instant skeleton for the product editor — paints while the product loads so
// opening an edit page from the list feels immediate.
export default function ProductEditLoading() {
  const card: React.CSSProperties = {
    borderRadius: 12,
    border: "1px solid var(--dash-border, rgba(0,0,0,0.08))",
    background: "var(--dash-surface, #fff)",
  };
  const bone: React.CSSProperties = {
    borderRadius: 6,
    background: "var(--dash-surface-2, rgba(0,0,0,0.07))",
  };
  return (
    <div className="dash-page-enter" aria-busy="true">
      <div
        className="animate-pulse"
        style={{ maxWidth: 1100, margin: "0 auto" }}
      >
        <div className="mb-5 flex items-center gap-3">
          <div style={{ ...bone, height: 32, width: 32 }} />
          <div>
            <div style={{ ...bone, height: 22, width: 260 }} />
            <div style={{ ...bone, height: 13, width: 340, marginTop: 8 }} />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-4">
            <div style={{ ...card, height: 320 }} />
            <div style={{ ...card, height: 220 }} />
            <div style={{ ...card, height: 180 }} />
          </div>
          <div className="space-y-4">
            <div style={{ ...card, height: 260 }} />
            <div style={{ ...card, height: 200 }} />
          </div>
        </div>
      </div>
    </div>
  );
}
