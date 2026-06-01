import {
  PackagePlus,
  UserPlus,
  Tag,
  FileSignature,
  Layers,
} from "lucide-react";
import { Button } from "@/components/ui/button";

export function QuickActionsPanel() {
  return (
    <div className="enterprise-card p-6 h-full flex flex-col">
      <h2 className="text-xl font-semibold text-primary mb-6">Quick Actions</h2>

      <div className="flex flex-col gap-3 flex-1">
        <Button
          variant="outline"
          className="justify-start gap-3 h-12 shadow-sm border-border bg-card hover:bg-slate-50 transition-colors w-full font-medium"
        >
          <div className="h-8 w-8 rounded bg-slate-100 flex items-center justify-center text-primary shrink-0">
            <PackagePlus className="h-4 w-4" />
          </div>
          Add Product
        </Button>

        <Button
          variant="outline"
          className="justify-start gap-3 h-12 shadow-sm border-border bg-card hover:bg-slate-50 transition-colors w-full font-medium"
        >
          <div className="h-8 w-8 rounded bg-slate-100 flex items-center justify-center text-primary shrink-0">
            <UserPlus className="h-4 w-4" />
          </div>
          Add Customer
        </Button>

        <Button
          variant="outline"
          className="justify-start gap-3 h-12 shadow-sm border-border bg-card hover:bg-slate-50 transition-colors w-full font-medium"
        >
          <div className="h-8 w-8 rounded bg-slate-100 flex items-center justify-center text-primary shrink-0">
            <Tag className="h-4 w-4" />
          </div>
          Create Discount
        </Button>

        <Button
          variant="outline"
          className="justify-start gap-3 h-12 shadow-sm border-border bg-card hover:bg-slate-50 transition-colors w-full font-medium"
        >
          <div className="h-8 w-8 rounded bg-slate-100 flex items-center justify-center text-primary shrink-0">
            <FileSignature className="h-4 w-4" />
          </div>
          Publish Blog
        </Button>

        <Button
          variant="outline"
          className="justify-start gap-3 h-12 shadow-sm border-border bg-card hover:bg-slate-50 transition-colors w-full font-medium"
        >
          <div className="h-8 w-8 rounded bg-slate-100 flex items-center justify-center text-primary shrink-0">
            <Layers className="h-4 w-4" />
          </div>
          Manage Inventory
        </Button>
      </div>
    </div>
  );
}
