import React, { useEffect, useRef, useState } from 'react';

interface Props {
  value: number;
  className?: string;
  duration?: number;
}

// Rolls the displayed number up/down to the target with an ease-out, and gives a
// quick scale "pop" whenever the value changes — so gains read as satisfying.
export const AnimatedNumber: React.FC<Props> = ({ value, className = '', duration = 550 }) => {
  const [display, setDisplay] = useState(value);
  const [bump, setBump] = useState(false);
  const displayRef = useRef(value);
  const rafRef = useRef(0);

  useEffect(() => {
    if (value === displayRef.current) return;
    const from = displayRef.current;
    const to = value;
    let start = 0;
    setBump(true);

    const step = (ts: number) => {
      if (!start) start = ts;
      const p = Math.min(1, (ts - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      const current = Math.round(from + (to - from) * eased);
      displayRef.current = current;
      setDisplay(current);
      if (p < 1) rafRef.current = requestAnimationFrame(step);
      else { displayRef.current = to; setDisplay(to); }
    };
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(step);
    const bt = setTimeout(() => setBump(false), 220);
    return () => { cancelAnimationFrame(rafRef.current); clearTimeout(bt); };
  }, [value, duration]);

  return (
    <span className={`${className} inline-block transition-transform duration-200 ${bump ? 'scale-125' : 'scale-100'}`}>
      {display}
    </span>
  );
};
