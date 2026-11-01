import { useEffect, useRef, useState } from 'react';
import { IconSearch } from './icons.tsx';
import { ui, twMerge } from './classes.ts';

/** Local input, trimmed and committed to the URL after 300 ms (spec §4). Re-syncs on back/forward. */
export function SearchBox({
  value,
  onCommit,
  placeholder = 'Description, counterparty or transfer reference',
  id = 'f-q',
}: {
  value: string;
  onCommit: (q: string) => void;
  placeholder?: string;
  id?: string;
}) {
  const [text, setText] = useState(value);
  const committed = useRef(value);
  useEffect(() => {
    if (value !== committed.current) {
      committed.current = value;
      setText(value);
    }
  }, [value]);
  useEffect(() => {
    const trimmed = text.trim();
    if (trimmed === committed.current) return;
    const t = window.setTimeout(() => {
      committed.current = trimmed;
      onCommit(trimmed);
    }, 300);
    return () => window.clearTimeout(t);
  }, [text, onCommit]);
  return (
    <div className={ui.field}>
      <label className={ui.label} htmlFor={id}>
        Search
      </label>
      <div className="relative">
        <IconSearch size={18} className="absolute top-[13px] left-3 text-muted" />
        <input
          id={id}
          className={twMerge(ui.input, 'pl-10')}
          type="search"
          value={text}
          placeholder={placeholder}
          onChange={(e) => setText(e.target.value)}
        />
      </div>
    </div>
  );
}
