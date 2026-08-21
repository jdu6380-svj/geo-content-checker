"use client";

import { useEffect, useRef, useState } from "react";

type AnimatedNumberProps = {
  value: number;
  from?: number;
  duration?: number;
  delay?: number;
  showSign?: boolean;
};

function formatNumber(value: number, showSign: boolean): string {
  if (showSign && value > 0) return `+${value}`;
  return String(value);
}

export function AnimatedNumber({
  value,
  from = 0,
  duration = 720,
  delay = 0,
  showSign = false,
}: AnimatedNumberProps) {
  const [displayValue, setDisplayValue] = useState(from);
  const numberRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion || duration <= 0 || from === value) {
      setDisplayValue(value);
      return;
    }

    let animationFrame = 0;
    let startTime: number | null = null;
    let timeout = 0;
    let started = false;
    const startAnimation = () => {
      if (started) return;
      started = true;
      setDisplayValue(from);
      timeout = window.setTimeout(() => {
        const animate = (timestamp: number) => {
          if (startTime === null) startTime = timestamp;
          const progress = Math.min((timestamp - startTime) / duration, 1);
          const easedProgress = 1 - Math.pow(1 - progress, 3);
          setDisplayValue(Math.round(from + (value - from) * easedProgress));
          if (progress < 1) animationFrame = window.requestAnimationFrame(animate);
        };
        animationFrame = window.requestAnimationFrame(animate);
      }, delay);
    };

    const number = numberRef.current;
    if (!number || typeof IntersectionObserver === "undefined") {
      startAnimation();
      return () => {
        window.clearTimeout(timeout);
        window.cancelAnimationFrame(animationFrame);
      };
    }

    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      startAnimation();
      observer.disconnect();
    }, { threshold: 0.2 });
    observer.observe(number);

    return () => {
      observer.disconnect();
      window.clearTimeout(timeout);
      window.cancelAnimationFrame(animationFrame);
    };
  }, [delay, duration, from, value]);

  return (
    <>
      <span ref={numberRef} className="phase-motion-number" aria-hidden="true">
        {formatNumber(displayValue, showSign)}
      </span>
      <span className="sr-only">{formatNumber(value, showSign)}</span>
    </>
  );
}
