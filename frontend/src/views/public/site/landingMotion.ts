import { createContext, useContext, useEffect, useRef, useState } from 'react';

/** True when the landing page may animate (super admin setting on, no reduced-motion preference). */
export const LandingMotionContext = createContext(true);
export const useLandingMotion = () => useContext(LandingMotionContext);

export function usePrefersReducedMotion(): boolean {
  const query = '(prefers-reduced-motion: reduce)';
  const [reduced, setReduced] = useState(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(query).matches : false
  );
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia(query);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, []);
  return reduced;
}

/**
 * Whether the element is on screen. With `once` it stays true after the first time.
 * Without IntersectionObserver (old browsers, tests) everything counts as visible.
 */
export function useInView<T extends Element>(once = true, threshold = 0.25) {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(() => typeof IntersectionObserver === 'undefined');
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          if (once) obs.disconnect();
        } else if (!once) {
          setInView(false);
        }
      },
      { threshold }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [once, threshold]);
  return [ref, inView] as const;
}
