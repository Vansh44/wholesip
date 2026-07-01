import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface LoaderProps {
  className?: string;
  size?: number;
}

export function Loader({ className, size = 32 }: LoaderProps) {
  return (
    <Loader2 
      size={size}
      className={cn("animate-spin text-gray-400", className)} 
    />
  );
}
