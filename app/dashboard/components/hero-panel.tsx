export function HeroPanel() {
  const dateOptions: Intl.DateTimeFormatOptions = {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  };
  const currentDate = new Date().toLocaleDateString("en-US", dateOptions);

  return (
    <div className="dashboard-panel-muted flex flex-col justify-between gap-6 px-5 py-5 sm:flex-row sm:items-end sm:px-6">
      <div className="flex max-w-3xl flex-col gap-3">
        <span className="dashboard-kicker">Store Command Deck</span>
        <h1 className="text-3xl font-semibold tracking-[-0.04em] text-primary sm:text-4xl">
          Operations Center
        </h1>
        <p className="max-w-2xl text-sm leading-6 text-secondary-foreground sm:text-[15px]">
          Welcome back, Vansh. A sharper read on revenue, inventory, and team
          activity for the day ahead.
        </p>
      </div>
      <div className="flex flex-col items-start gap-3 sm:items-end">
        <div className="dashboard-chip">
          <span className="dashboard-status-dot" />
          Live trading window
        </div>
        <div className="border border-border/80 bg-card px-4 py-3 text-sm font-medium text-secondary-foreground">
          {currentDate}
        </div>
      </div>
    </div>
  );
}
