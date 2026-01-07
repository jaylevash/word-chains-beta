type EventParams = Record<string, string | number | boolean | null | undefined>;

export const trackEvent = (name: string, params: EventParams = {}) => {
  if (typeof window === "undefined") return;
  const gtag = (window as { gtag?: (...args: unknown[]) => void }).gtag;
  if (typeof gtag !== "function") return;
  gtag("event", name, params);
};
