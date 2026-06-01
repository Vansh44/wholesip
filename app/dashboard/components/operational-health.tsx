import { Database, ShieldCheck, HardDrive, CreditCard } from "lucide-react";

export function OperationalHealth() {
  const services = [
    {
      name: "Database",
      status: "Healthy",
      icon: Database,
      color: "text-success",
    },
    {
      name: "Authentication",
      status: "Healthy",
      icon: ShieldCheck,
      color: "text-success",
    },
    {
      name: "Storage",
      status: "Healthy",
      icon: HardDrive,
      color: "text-success",
    },
    {
      name: "Payments",
      status: "Healthy",
      icon: CreditCard,
      color: "text-success",
    },
  ];

  return (
    <div className="enterprise-card p-6 h-full flex flex-col">
      <h2 className="text-xl font-semibold text-primary mb-6">
        Operational Health
      </h2>

      <div className="flex flex-col gap-4 flex-1">
        {services.map((service, index) => (
          <div
            key={index}
            className="flex items-center justify-between p-3 rounded-xl border border-border bg-slate-50/50 hover:bg-slate-50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded bg-white border border-border shadow-sm flex items-center justify-center shrink-0">
                <service.icon className="h-4 w-4 text-primary" />
              </div>
              <span className="font-medium text-primary">{service.name}</span>
            </div>

            <div className="flex items-center gap-2 bg-success/10 px-2.5 py-1 rounded-full border border-success/20">
              <span
                className={`w-2 h-2 rounded-full bg-success animate-pulse`}
              ></span>
              <span className="text-xs font-semibold text-success uppercase tracking-wider">
                {service.status}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
