export function HeroPanel() {
  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <header className="dash-page-header">
      <h1>{greeting}, Vansh 👋</h1>
      <p>Here&apos;s what&apos;s happening with your store today.</p>
    </header>
  );
}
