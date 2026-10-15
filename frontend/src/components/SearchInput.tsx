import { useRef, useState } from 'react';

// Search box that waits for an IME composition (pinyin, zhuyin, ...) to finish
// before reporting the new text, so results don't flicker on half-typed input.
export default function SearchInput({
  value,
  onChange,
  placeholder,
  className = '',
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const composing = useRef(false);
  // While composing, show the in-progress text; otherwise mirror the parent.
  const [draft, setDraft] = useState<string | null>(null);

  return (
    <input
      type="text"
      inputMode="search"
      value={draft ?? value}
      placeholder={placeholder}
      className={className}
      onCompositionStart={() => {
        composing.current = true;
      }}
      onCompositionEnd={(event) => {
        composing.current = false;
        setDraft(null);
        onChange(event.currentTarget.value);
      }}
      onChange={(event) => {
        if (composing.current) {
          setDraft(event.target.value);
        } else {
          setDraft(null);
          onChange(event.target.value);
        }
      }}
    />
  );
}
