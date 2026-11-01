import { useEffect, useRef } from 'react';

export function useStepHeadingFocus(isUnknown = false) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, []);
  useEffect(() => {
    if (isUnknown) headingRef.current?.focus();
  }, [isUnknown]);
  return headingRef;
}
