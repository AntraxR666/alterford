import { useEffect, useState } from "react";

export function useLiveNow(intervalMs = 1_000): number {
  const [nowSeconds, setNowSeconds] = useState(() => Math.floor(Date.now() / 1_000));

  useEffect(() => {
    const timer = window.setInterval(() => setNowSeconds(Math.floor(Date.now() / 1_000)), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);

  return nowSeconds;
}
