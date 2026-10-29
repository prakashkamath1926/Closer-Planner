"use client";

import { useSyncExternalStore } from "react";

const emptySubscribe = () => () => {};

function useIsMounted() {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
}

interface ClientDateTimeProps {
  date: string | Date;
  options?: Intl.DateTimeFormatOptions;
  prefix?: string;
  fallback?: string;
  className?: string;
}

/**
 * Renders localized date/time on the client without hydration mismatches.
 * Uses useSyncExternalStore (React 19 recommended) to ensure identical server
 * and initial client render, switching to user's localized format upon hydration.
 */
export function ClientDateTime({
  date,
  options,
  prefix = "",
  fallback = "Date not set",
  className,
}: ClientDateTimeProps) {
  const isMounted = useIsMounted();

  if (!date) {
    return <span className={className}>{fallback}</span>;
  }

  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) {
    return <span className={className}>{fallback}</span>;
  }

  // Consistent server and initial client fallback (ISO YYYY-MM-DD)
  const serverSafe = d.toISOString().split("T")[0];

  return (
    <span className={className} suppressHydrationWarning>
      {prefix}
      {isMounted ? d.toLocaleString(undefined, options) : serverSafe}
    </span>
  );
}
