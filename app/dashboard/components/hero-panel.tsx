import { Button } from "@/components/ui/button";
import { Plus, ShoppingCart, Users, BarChart2 } from "lucide-react";

export function HeroPanel() {
  return (
    <div className="enterprise-card flex flex-col md:flex-row items-center justify-between p-8 bg-gradient-to-br from-white to-slate-50 min-h-[180px] dark:from-slate-900 dark:to-slate-900 border-border">
      <div className="flex flex-col gap-2 max-w-xl">
        <h1 className="text-3xl font-bold tracking-tight text-primary">
          Good Evening, Vansh 👋
        </h1>
        <p className="text-base text-secondary-foreground">
          Welcome back to Soakd Operations Center.{" "}
          <br className="hidden sm:block" />
          Monitor orders, products, inventory, customers and business
          performance.
        </p>
      </div>

      <div className="mt-6 md:mt-0 flex flex-col gap-3 min-w-[200px]">
        <h3 className="text-sm font-semibold text-secondary-foreground uppercase tracking-wider">
          Quick Actions
        </h3>
        <div className="grid grid-cols-2 gap-3">
          <Button
            variant="outline"
            className="justify-start gap-2 h-10 shadow-sm border-border bg-card hover:bg-slate-50 transition-colors"
          >
            <Plus className="h-4 w-4" /> Add Product
          </Button>
          <Button
            variant="outline"
            className="justify-start gap-2 h-10 shadow-sm border-border bg-card hover:bg-slate-50 transition-colors"
          >
            <ShoppingCart className="h-4 w-4" /> Create Order
          </Button>
          <Button
            variant="outline"
            className="justify-start gap-2 h-10 shadow-sm border-border bg-card hover:bg-slate-50 transition-colors"
          >
            <Users className="h-4 w-4" /> Add Customer
          </Button>
          <Button
            variant="outline"
            className="justify-start gap-2 h-10 shadow-sm border-border bg-card hover:bg-slate-50 transition-colors"
          >
            <BarChart2 className="h-4 w-4 text-accent" /> View Analytics
          </Button>
        </div>
      </div>
    </div>
  );
}
