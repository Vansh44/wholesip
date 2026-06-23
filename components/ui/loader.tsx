import Image, { ImageProps } from "next/image";
import { cn } from "@/lib/utils";

interface LoaderProps extends Omit<ImageProps, "src" | "alt"> {
  className?: string;
}

export function Loader({ className, ...props }: LoaderProps) {
  return (
    <Image
      src="/loader.svg"
      alt="Loading..."
      width={200}
      height={60}
      className={cn("w-32 h-auto", className)}
      {...props}
    />
  );
}
