import React from "react";

export const metadata = {
  title: "Soakd — Sign In",
};

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background font-sans">
      <div className="w-full max-w-[360px] px-4">{children}</div>
    </div>
  );
}
