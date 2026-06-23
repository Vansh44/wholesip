import * as React from "react"
import { cn } from "@/lib/utils"

export function Loader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("loader", className)}
      {...props}
    />
  )
}
