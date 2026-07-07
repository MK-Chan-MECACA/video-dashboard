'use client';

import { useEffect, useState, type ElementType, type ReactNode } from 'react';

/**
 * Renders timestamps in the viewer's local timezone.
 *
 * The pages that use these are Server Components, so calling `Date#toLocale*`
 * during render formats with the *server's* timezone (UTC on the deploy host)
 * rather than the browser's — which is why the timeline was showing the wrong
 * time. Formatting on the client fixes that.
 *
 * To avoid a hydration mismatch, the first paint (server HTML + initial client
 * render) formats deterministically in UTC, then we swap to the browser's local
 * timezone after mount.
 */
function useMounted() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}

const TIME_OPTS: Intl.DateTimeFormatOptions = {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
};

/** Short local time (HH:MM, 24h) with a full local date-time tooltip. */
export function LocalTime({ iso, className }: { iso: string; className?: string }) {
  const mounted = useMounted();
  const date = new Date(iso);
  return (
    <time
      dateTime={iso}
      className={className}
      title={mounted ? date.toLocaleString() : undefined}
      suppressHydrationWarning
    >
      {date.toLocaleTimeString([], mounted ? TIME_OPTS : { ...TIME_OPTS, timeZone: 'UTC' })}
    </time>
  );
}

/** Wrapper element whose `title` tooltip shows the full local date-time. */
export function LocalTimeTitle({
  iso,
  as: Tag = 'span',
  className,
  children,
}: {
  iso: string;
  as?: ElementType;
  className?: string;
  children: ReactNode;
}) {
  const mounted = useMounted();
  return (
    <Tag
      className={className}
      title={mounted ? new Date(iso).toLocaleString() : undefined}
      suppressHydrationWarning
    >
      {children}
    </Tag>
  );
}
