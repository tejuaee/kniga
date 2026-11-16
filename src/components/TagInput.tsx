import { useEffect, useState, type KeyboardEvent } from 'react';
import { api } from '../api';
import { XIcon } from './Icons';

const normalize = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

/** UC-09: free-form tags, lowercase and de-duplicated, with suggestions from tags you've used before. */
export function TagInput({ value, onChange }: { value: string[]; onChange: (tags: string[]) => void }) {
  const [draft, setDraft] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) return;
    const t = setTimeout(() => {
      api<{ tags: string[] }>(`/logs/tags?q=${encodeURIComponent(normalize(draft))}`)
        .then((r) => setSuggestions(r.tags.filter((s) => !value.includes(s))))
        .catch(() => setSuggestions([]));
    }, 150);
    return () => clearTimeout(t);
  }, [draft, focused, value]);

  const add = (raw: string) => {
    const tag = normalize(raw);
    if (tag && !value.includes(tag) && tag.length <= 40) onChange([...value, tag]);
    setDraft('');
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      if (draft.trim()) add(draft);
    } else if (e.key === 'Backspace' && !draft && value.length) {
      onChange(value.slice(0, -1));
    }
  };

  return (
    <div className="tag-input-wrap">
      <div className="tag-input input">
        {value.map((t) => (
          <span className="tag" key={t}>
            {t}
            <button type="button" onClick={() => onChange(value.filter((x) => x !== t))} aria-label={`Remove tag ${t}`}>
              <XIcon size={12} />
            </button>
          </span>
        ))}
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKey}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setTimeout(() => setFocused(false), 120);
            if (draft.trim()) add(draft);
          }}
          placeholder={value.length ? '' : 'Add tags… (press Enter)'}
          aria-label="Tags"
        />
      </div>
      {focused && suggestions.length > 0 && (
        <ul className="tag-suggestions" role="listbox">
          {suggestions.map((s) => (
            <li key={s}>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => add(s)}>
                {s}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
