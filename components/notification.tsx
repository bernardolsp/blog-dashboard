"use client";

import { CheckCircle2, AlertCircle } from "lucide-react";

interface NotificationProps {
  message: string;
  type: "success" | "error";
}

export function Notification({ message, type }: NotificationProps) {
  return (
    <div
      className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg animate-fade-in flex items-center gap-2 ${
        type === "success"
          ? "bg-green-500/20 border border-green-500/50 text-green-400"
          : "bg-red-500/20 border border-red-500/50 text-red-400"
      }`}
    >
      {type === "success" ? (
        <CheckCircle2 size={18} />
      ) : (
        <AlertCircle size={18} />
      )}
      {message}
    </div>
  );
}
