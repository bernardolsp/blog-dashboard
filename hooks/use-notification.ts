"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type NotificationType = "success" | "error";

export interface NotificationState {
  message: string;
  type: NotificationType;
}

export function useNotification(duration = 3000) {
  const [notification, setNotification] = useState<NotificationState | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearNotification = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setNotification(null);
  }, []);

  const showNotification = useCallback(
    (message: string, type: NotificationType) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      setNotification({ message, type });
      timeoutRef.current = setTimeout(() => {
        setNotification(null);
        timeoutRef.current = null;
      }, duration);
    },
    [duration]
  );

  useEffect(() => clearNotification, [clearNotification]);

  return {
    notification,
    showNotification,
    clearNotification,
  };
}
