import { Plus, ShoppingCart, Users, Tag } from "lucide-react";

export function ActionCards() {
  const actions = [
    { name: "New Product", icon: Plus, color: "text-primary" },
    { name: "Create Order", icon: ShoppingCart, color: "text-primary" },
    { name: "Add Customer", icon: Users, color: "text-primary" },
    { name: "Create Discount", icon: Tag, color: "text-primary" },
  ];

  return (
    <div className="flex flex-wrap items-center gap-6 py-2 border-b border-border mb-6">
      <span className="text-sm font-semibold text-primary mr-2">
        Quick Actions:
      </span>
      {actions.map((action, idx) => (
        <button
          key={idx}
          className="flex items-center gap-2 text-sm font-medium text-secondary-foreground hover:text-primary transition-colors group"
        >
          <action.icon className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
          {action.name}
        </button>
      ))}
    </div>
  );
}
