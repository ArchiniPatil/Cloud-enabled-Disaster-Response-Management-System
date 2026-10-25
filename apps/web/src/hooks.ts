import { useState, useCallback, useEffect, useRef } from "react";
import { api } from "./api";
export function useData<T = any>(path: string, pollMs = 0) {
  const [data, setData] = useState<T | null>(null),
    [error, setError] = useState("");
  const sequence = useRef(0);
  const reload = useCallback(async () => {
    const request = ++sequence.current;
    try {
      const result = await api<T>(path);
      if (request === sequence.current) {
        setData(result);
        setError("");
      }
    } catch (e) {
      if (request === sequence.current) setError((e as Error).message);
    }
  }, [path]);
  useEffect(() => {
    setData(null);
    setError("");
    void reload();
    const timer = pollMs
      ? window.setInterval(() => {
          if (document.visibilityState === "visible") void reload();
        }, pollMs)
      : undefined;
    return () => {
      ++sequence.current;
      if (timer) window.clearInterval(timer);
    };
  }, [reload, pollMs]);
  return { data, error, reload };
}
