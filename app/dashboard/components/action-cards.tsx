import { Plus, ShoppingCart, Users, Tag } from "lucide-react";

export function ActionCards() {
  const actions = [
    {
      name: "New Product",
      description: "Add a launch-ready SKU",
      icon: Plus,
    },
    {
      name: "Create Order",
      description: "Capture a manual sale",
      icon: ShoppingCart,
    },
    {
      name: "Add Customer",
      description: "Create a new contact record",
      icon: Users,
    },
    {
      name: "Create Discount",
      description: "Issue a conversion offer",
      icon: Tag,
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
      {actions.map((action) => (
        <button
          key={action.name}
          className="dashboard-panel group flex min-h-[120px] flex-col justify-between gap-5 px-5 py-5 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-accent/35 hover:bg-card"
        >
          <div className="flex items-start justify-between gap-3">
            <span className="dashboard-kicker">Quick Action</span>
            <div className="flex h-10 w-10 items-center justify-center border border-border/80 bg-background text-primary transition-colors group-hover:border-accent/30 group-hover:text-accent">
              <action.icon className="h-4 w-4" />
            </div>
          </div>
          <div className="space-y-1.5">
            <p className="text-base font-semibold tracking-[-0.02em] text-primary">
              {action.name}
            </p>
            <p className="text-sm leading-5 text-secondary-foreground">
              {action.description}
            </p>
          </div>
        </button>
      ))}
    </div>
  );
}
