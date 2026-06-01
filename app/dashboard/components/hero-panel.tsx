export function HeroPanel() {
  const dateOptions: Intl.DateTimeFormatOptions = {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  };
  const currentDate = new Date().toLocaleDateString("en-US", dateOptions);

  return (
    <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-2">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-primary">
          Operations Center
        </h1>
        <p className="text-sm text-secondary-foreground">
          Welcome back, Vansh. Here's what's happening today.
        </p>
      </div>
      <div className="flex items-center text-sm font-medium text-secondary-foreground bg-secondary/50 px-3 py-1.5 rounded-md border border-border/50">
        {currentDate}
      </div>
    </div>
  );
}
