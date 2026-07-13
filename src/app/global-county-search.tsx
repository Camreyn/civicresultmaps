"use client";

import { Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { CountySearchMatch } from "@/lib/county-search";
import { usStateOptions } from "@/lib/us-states";
import styles from "./global-county-search.module.css";

type SearchEnvelope = {
  data: CountySearchMatch[];
  meta?: { rowCount?: number };
};

export type GlobalCountySearchProps = {
  className?: string;
  defaultState?: string;
  label?: string;
  placeholder?: string;
};

export function GlobalCountySearch({
  className = "",
  defaultState = "",
  label = "Find a county or county equivalent",
  placeholder = "County name, alias, or five-digit FIPS",
}: GlobalCountySearchProps) {
  const router = useRouter();
  const listId = useId();
  const requestId = useRef(0);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [error, setError] = useState("");
  const [focused, setFocused] = useState(false);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CountySearchMatch[]>([]);
  const [searched, setSearched] = useState(false);
  const [state, setState] = useState(defaultState.toUpperCase());

  useEffect(() => {
    const normalizedQuery = query.trim();
    if (!normalizedQuery && !state) {
      setActiveIndex(-1);
      setError("");
      setLoading(false);
      setResults([]);
      setSearched(false);
      return;
    }

    const currentRequest = requestId.current + 1;
    requestId.current = currentRequest;
    const abortController = new AbortController();
    const timeout = window.setTimeout(async () => {
      setError("");
      setLoading(true);
      try {
        const params = new URLSearchParams({ limit: "10", q: normalizedQuery });
        if (state) {
          params.set("state", state);
        }
        const response = await fetch(`/api/jurisdictions/search?${params.toString()}`, {
          signal: abortController.signal,
        });
        if (!response.ok) {
          throw new Error("County search is temporarily unavailable.");
        }
        const payload = (await response.json()) as SearchEnvelope;
        if (currentRequest !== requestId.current) {
          return;
        }
        setResults(payload.data ?? []);
        setActiveIndex(payload.data?.length ? 0 : -1);
        setSearched(true);
      } catch (searchError) {
        if (abortController.signal.aborted || currentRequest !== requestId.current) {
          return;
        }
        setActiveIndex(-1);
        setError(searchError instanceof Error ? searchError.message : "County search is temporarily unavailable.");
        setResults([]);
        setSearched(true);
      } finally {
        if (currentRequest === requestId.current) {
          setLoading(false);
        }
      }
    }, 160);

    return () => {
      window.clearTimeout(timeout);
      abortController.abort();
    };
  }, [query, state]);

  const open = focused && (loading || searched || Boolean(error));
  const activeResult = activeIndex >= 0 ? results[activeIndex] : undefined;
  const statusText = useMemo(() => {
    if (loading) return "Searching counties";
    if (error) return error;
    if (!searched) return "";
    return `${results.length} ${results.length === 1 ? "county" : "counties"} found`;
  }, [error, loading, results.length, searched]);

  function openCounty(result: CountySearchMatch) {
    setFocused(false);
    router.push(`/county/${result.fips}`);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (results.length) {
        setActiveIndex((current) => (current + 1 + results.length) % results.length);
      }
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (results.length) {
        setActiveIndex((current) => (current - 1 + results.length) % results.length);
      }
      return;
    }
    if (event.key === "Enter" && activeResult) {
      event.preventDefault();
      openCounty(activeResult);
      return;
    }
    if (event.key === "Escape") {
      setFocused(false);
    }
  }

  return (
    <div className={`${styles.search} ${className}`.trim()}>
      <label className={styles.label} htmlFor={`${listId}-input`}>{label}</label>
      <div className={styles.controls}>
        <div className={styles.inputShell}>
          <Search aria-hidden size={17} />
          <input
            aria-activedescendant={activeResult ? `${listId}-option-${activeResult.fips}` : undefined}
            aria-autocomplete="list"
            aria-controls={listId}
            aria-expanded={open}
            autoComplete="off"
            id={`${listId}-input`}
            onBlur={() => window.setTimeout(() => setFocused(false), 100)}
            onChange={(event) => setQuery(event.target.value)}
            onFocus={() => setFocused(true)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            role="combobox"
            type="search"
            value={query}
          />
          {query ? (
            <button
              aria-label="Clear county search"
              className={styles.clear}
              onClick={() => {
                setQuery("");
                setResults([]);
                setSearched(false);
              }}
              type="button"
            >
              <X aria-hidden size={15} />
            </button>
          ) : null}
        </div>
        <label className={styles.stateLabel}>
          <span>State</span>
          <select aria-label="Limit county search to a state" onChange={(event) => setState(event.target.value)} value={state}>
            <option value="">All states</option>
            {usStateOptions.map(([code, name]) => (
              <option key={code} value={code}>{name}</option>
            ))}
          </select>
        </label>
      </div>

      <span aria-live="polite" className={styles.srOnly} role="status">{statusText}</span>
      {open ? (
        <div className={styles.menu}>
          {loading ? <p className={styles.message}>Searching the canonical county registry…</p> : null}
          {!loading && error ? <p className={`${styles.message} ${styles.error}`}>{error}</p> : null}
          {!loading && !error && searched && !results.length ? (
            <p className={styles.message}>No current Census county equivalent matched that search.</p>
          ) : null}
          {!loading && !error && results.length ? (
            <ul aria-label="County search results" id={listId} role="listbox">
              {results.map((result, index) => (
                <li
                  className={index === activeIndex ? styles.active : undefined}
                  key={result.fips}
                  onMouseDown={(event) => event.preventDefault()}
                  role="none"
                >
                  <button
                    aria-selected={index === activeIndex}
                    id={`${listId}-option-${result.fips}`}
                    onClick={() => openCounty(result)}
                    role="option"
                    type="button"
                  >
                    <span>
                      <strong>{result.displayName}</strong>
                      <small>{result.stateName} · FIPS {result.fips}</small>
                    </span>
                    {result.historicalContext ? (
                      <em title={result.historicalContext.caveat}>
                        Historical: {result.historicalContext.formerName} (FIPS {result.historicalContext.formerFips}); current match
                      </em>
                    ) : result.matchedOn === "alias" ? (
                      <em>Alias: {result.matchedValue}</em>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
