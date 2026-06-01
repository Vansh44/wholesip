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
    <div className="h-full flex flex-col">
      <div className="mb-8 border-b border-border pb-3">
        <h2 className="text-lg font-semibold text-primary">
          Operational Health
        </h2>
      </div>

      <div className="flex flex-col flex-1">
        {services.map((service, index) => (
          <div
            key={index}
            className="flex items-center justify-between py-3 border-b border-border/40 last:border-0"
          >
            <div className="flex items-center gap-3">
              <service.icon className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium text-sm text-primary">
                {service.name}
              </span>
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
