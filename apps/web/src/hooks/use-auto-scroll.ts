import { useEffect, useRef } from "react";

export function useAutoScroll(dependency: unknown) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ref.current) {
      ref.current.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [dependency]);

  return ref;
}