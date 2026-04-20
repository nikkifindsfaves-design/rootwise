"use client";

import { createClient } from "@/lib/supabase/client";
import {
  PLACE_INPUT_BLUR_CLOSE_DELAY_MS,
  PLACE_INPUT_DEBOUNCE_MS,
  PLACE_INPUT_RESULT_LIMIT,
  PLACE_INPUT_SEARCH_THRESHOLD,
} from "@/lib/constants/shared-values";
import { formatPlace } from "@/lib/utils/places";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
} from "react";

const sans = "var(--font-dg-body), Lato, sans-serif";

export type PlaceInputSelection = {
  id: string;
  township: string | null;
  county: string | null;
  state: string | null;
  country: string;
  display: string;
};

type PlaceRow = {
  id: string;
  township: string | null;
  county: string | null;
  state: string | null;
  country: string;
};

type PlaceInputProps = {
  value: string;
  onChange: (value: string) => void;
  onPlaceSelect: (place: PlaceInputSelection) => void;
  placeholder?: string;
  className?: string;
  style?: CSSProperties;
  locked?: boolean;
};

/** PostgREST-safe `ilike` value for `...contains term...` (no user-supplied `%` / `_`). */
function quoteIlikeContains(term: string): string {
  const trimmed = term.trim();
  const noWild = trimmed.replace(/%/g, "").replace(/_/g, "");
  const escaped = noWild.replace(/"/g, '""');
  return `"%${escaped}%"`;
}

function buildPlacesOrFilter(term: string): string {
  const q = quoteIlikeContains(term);
  return `township.ilike.${q},county.ilike.${q},state.ilike.${q},country.ilike.${q}`;
}

export function PlaceInput({
  value,
  onChange,
  onPlaceSelect,
  placeholder,
  className,
  style: styleProp,
  locked = false,
}: PlaceInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const blurCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fetchGenRef = useRef(0);
  const listboxId = useId();

  const [suggestions, setSuggestions] = useState<PlaceRow[]>([]);
  const [listOpen, setListOpen] = useState(false);

  function clearBlurCloseTimer() {
    if (blurCloseTimerRef.current != null) {
      clearTimeout(blurCloseTimerRef.current);
      blurCloseTimerRef.current = null;
    }
  }

  useEffect(() => {
    if (locked) {
      setSuggestions([]);
      setListOpen(false);
      return;
    }
    const term = value.trim();
    const gen = ++fetchGenRef.current;

    if (term.length < PLACE_INPUT_SEARCH_THRESHOLD) {
      const clearTimer = setTimeout(() => {
        if (gen !== fetchGenRef.current) return;
        setSuggestions([]);
        setListOpen(false);
      }, 0);
      return () => clearTimeout(clearTimer);
    }

    const debounce = setTimeout(async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("places")
        .select("id, township, county, state, country")
        .or(buildPlacesOrFilter(term))
        .limit(PLACE_INPUT_RESULT_LIMIT);

      if (gen !== fetchGenRef.current) return;

      if (error) {
        console.error("places typeahead", error.message);
        setSuggestions([]);
        setListOpen(false);
        return;
      }

      const rows = (data ?? []) as PlaceRow[];
      setSuggestions(rows);
      setListOpen(rows.length > 0);
    }, PLACE_INPUT_DEBOUNCE_MS);

    return () => clearTimeout(debounce);
  }, [locked, value]);

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (locked) return;
    onChange(e.target.value);
  }

  function handleInputFocus() {
    if (locked) return;
    clearBlurCloseTimer();
    if (
      value.trim().length >= PLACE_INPUT_SEARCH_THRESHOLD &&
      suggestions.length > 0
    ) {
      setListOpen(true);
    }
  }

  function handleInputBlur() {
    if (locked) return;
    clearBlurCloseTimer();
    blurCloseTimerRef.current = setTimeout(() => {
      blurCloseTimerRef.current = null;
      const v = inputRef.current?.value ?? value;
      onChange(v);
      setListOpen(false);
    }, PLACE_INPUT_BLUR_CLOSE_DELAY_MS);
  }

  function pick(row: PlaceRow) {
    if (locked) return;
    clearBlurCloseTimer();
    const display = formatPlace(row);
    onPlaceSelect({
      id: row.id,
      township: row.township,
      county: row.county,
      state: row.state,
      country: row.country,
      display,
    });
    setListOpen(false);
    setSuggestions([]);
  }

  const inputClass =
    "block w-full rounded-md px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--dg-forest)_35%,transparent)]";
  const inputStyle: React.CSSProperties = {
    fontFamily: sans,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "var(--dg-brown-border)",
    backgroundColor: "var(--dg-bg-main)",
    color: "var(--dg-brown-dark)",
  };

  return (
    <div className={className ? `relative ${className}` : "relative"}>
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        value={value}
        onChange={handleInputChange}
        onFocus={handleInputFocus}
        onBlur={handleInputBlur}
        placeholder={placeholder}
        readOnly={locked}
        autoComplete="off"
        className={inputClass}
        style={{ ...inputStyle, ...styleProp }}
        aria-autocomplete="list"
        aria-controls={listboxId}
        aria-expanded={locked ? false : listOpen}
      />
      {!locked && listOpen && suggestions.length > 0 ? (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute z-50 mt-1 max-h-60 w-full overflow-y-auto rounded-md border py-1 shadow-md"
          style={{
            fontFamily: sans,
            backgroundColor: "var(--dg-cream)",
            borderColor: "var(--dg-paper-border)",
            boxShadow: "0 4px 20px rgb(var(--dg-shadow-rgb) / 0.06)",
          }}
        >
          {suggestions.map((row) => {
            const label = formatPlace(row);
            return (
              <li key={row.id} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={false}
                  className="w-full cursor-pointer border-0 px-3 py-2 text-left text-sm hover:bg-[var(--dg-parchment)]"
                  style={{ fontFamily: sans, color: "var(--dg-brown-dark)" }}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(row)}
                >
                  {label}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
