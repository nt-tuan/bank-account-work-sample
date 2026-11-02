import { IconSearch } from './icons.tsx';
import { ui, twMerge } from './classes.ts';

/** Controlled search input; the caller owns debounce and navigation resets. */
export function SearchBox({
  value,
  onChange,
  placeholder = 'Description, counterparty or transfer reference',
  id = 'f-q',
}: {
  value: string;
  onChange: (q: string) => void;
  placeholder?: string;
  id?: string;
}) {
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
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    </div>
  );
}
