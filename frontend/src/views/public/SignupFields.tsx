import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { COUNTRIES, flagEmoji, type Country } from '@/lib/countries';
import { cn } from '@/lib/utils';
import { errorInputClass, inputClass } from './PublicLayout';
import { passwordChecks, passwordStrength } from '@/lib/passwordRules';

// --- Password rules ----------------------------------------------------------------

const STRENGTH = [
  { label: '', bar: '' },
  { label: 'Weak', bar: 'bg-red-500' },
  { label: 'Fair', bar: 'bg-amber-500' },
  { label: 'Good', bar: 'bg-emerald-500' },
  { label: 'Strong', bar: 'bg-gradient-to-r from-emerald-500 to-teal-400' },
];

/** Live ✓/✗ checklist and strength meter under the password field. */
export const PasswordChecklist: React.FC<{ password: string; id?: string; showErrors?: boolean }> = ({
  password,
  id,
  showErrors,
}) => {
  const checks = passwordChecks(password);
  const score = passwordStrength(password);
  return (
    <div id={id} className="space-y-2" aria-live="polite">
      <div className="flex items-center gap-2">
        <div className="grid flex-1 grid-cols-4 gap-1" aria-hidden>
          {[1, 2, 3, 4].map((i) => (
            <span
              key={i}
              className={cn(
                'h-1.5 rounded-full transition-all duration-500',
                i <= score ? STRENGTH[score].bar : 'bg-white/[0.08] light:bg-gray-200'
              )}
            />
          ))}
        </div>
        <span
          className={cn(
            'w-12 text-right text-[11px] font-semibold',
            score <= 1 ? 'text-red-400 light:text-red-600' : score === 2 ? 'text-amber-400 light:text-amber-600' : 'text-emerald-400 light:text-emerald-600'
          )}
        >
          {password ? STRENGTH[score].label : ''}
        </span>
      </div>
      <ul className="flex flex-wrap gap-1.5" aria-label="Password requirements">
        {checks.map((c) => {
          const failed = !c.ok && (showErrors || password.length > 0);
          return (
            <li
              key={c.id}
              className={cn(
                'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors duration-300',
                c.ok
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300 light:border-emerald-200 light:bg-emerald-50 light:text-emerald-700'
                  : failed
                    ? 'border-red-500/30 bg-red-500/[0.08] text-red-300 light:border-red-200 light:bg-red-50 light:text-red-600'
                    : 'border-white/[0.08] bg-white/[0.02] text-white/50 light:border-gray-200 light:bg-gray-50 light:text-gray-500'
              )}
            >
              {c.ok ? <Check className="h-3 w-3" aria-hidden /> : <X className="h-3 w-3" aria-hidden />}
              <span>{c.label}</span>
              <span className="sr-only">{c.ok ? '(met)' : '(not met)'}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

// --- Phone with country code ---------------------------------------------------------

interface PhoneInputProps {
  id: string;
  country: Country;
  onCountry: (c: Country) => void;
  value: string;
  onChange: (v: string) => void;
  invalid?: boolean;
  disabled?: boolean;
  describedBy?: string;
  inputRef?: (el: HTMLInputElement | null) => void;
}

/** Searchable, scrollable country-code picker (India first) + national number input. */
export const PhoneInput: React.FC<PhoneInputProps> = ({
  id,
  country,
  onCountry,
  value,
  onChange,
  invalid,
  disabled,
  describedBy,
  inputRef,
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);
  const numberRef = useRef<HTMLInputElement | null>(null);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/^\+/, '');
    if (!q) return COUNTRIES;
    return COUNTRIES.filter(
      (c) => c.name.toLowerCase().includes(q) || c.dial.startsWith(q) || c.iso.toLowerCase() === q
    );
  }, [query]);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    const i = COUNTRIES.findIndex((c) => c.iso === country.iso);
    setActive(Math.max(0, i));
  }, [open, country.iso]);

  // Keep the highlighted row visible while moving with the keyboard.
  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [active, open, results]);

  const choose = (c: Country) => {
    onCountry(c);
    setOpen(false);
    requestAnimationFrame(() => numberRef.current?.focus());
  };

  const onSearchKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(results.length - 1, a + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (results[active]) choose(results[active]);
    }
  };

  const listId = `${id}-countries`;
  return (
    <div className="flex gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            aria-label={`Country code: ${country.name} +${country.dial}`}
            aria-haspopup="listbox"
            aria-expanded={open}
            className={cn(
              'flex h-10 shrink-0 items-center gap-1.5 rounded-md border px-2.5 text-sm transition-colors',
              'border-white/[0.1] bg-white/[0.02] text-white hover:border-emerald-500/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50',
              'light:border-gray-200 light:bg-white light:text-gray-900 light:hover:border-emerald-400',
              'disabled:cursor-not-allowed disabled:opacity-50',
              invalid && errorInputClass
            )}
          >
            <span className="text-base leading-none" aria-hidden>
              {flagEmoji(country.iso)}
            </span>
            <span className="tabular-nums">+{country.dial}</span>
            <ChevronDown className={cn('h-3.5 w-3.5 opacity-60 transition-transform', open && 'rotate-180')} aria-hidden />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[min(20rem,calc(100vw-2rem))] p-0">
          <div className="flex items-center gap-2 border-b border-white/[0.08] px-3 light:border-gray-200">
            <Search className="h-4 w-4 shrink-0 opacity-50" aria-hidden />
            <input
              autoFocus
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              onKeyDown={onSearchKey}
              placeholder="Search country or code"
              aria-label="Search country or code"
              aria-controls={listId}
              aria-activedescendant={results[active] ? `${listId}-${results[active].iso}` : undefined}
              className="h-10 w-full bg-transparent text-sm outline-none placeholder:text-white/30 light:placeholder:text-gray-400"
            />
          </div>
          <ul
            ref={listRef}
            id={listId}
            role="listbox"
            aria-label="Countries"
            className="max-h-64 overflow-y-auto overscroll-contain py-1"
          >
            {results.length === 0 && <li className="px-3 py-6 text-center text-sm opacity-60">No country found</li>}
            {results.map((c, i) => {
              const selected = c.iso === country.iso;
              return (
                <li
                  key={c.iso}
                  id={`${listId}-${c.iso}`}
                  data-index={i}
                  role="option"
                  aria-selected={selected}
                  onMouseEnter={() => setActive(i)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => choose(c)}
                  className={cn(
                    'flex cursor-pointer items-center gap-2.5 px-3 py-2 text-sm',
                    i === active && 'bg-emerald-500/10 light:bg-emerald-50',
                    i === 0 && !query && 'border-b border-white/[0.06] light:border-gray-100'
                  )}
                >
                  <span className="text-base leading-none" aria-hidden>
                    {flagEmoji(c.iso)}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{c.name}</span>
                  <span className="tabular-nums text-white/50 light:text-gray-500">+{c.dial}</span>
                  {selected && <Check className="h-4 w-4 text-emerald-400 light:text-emerald-600" aria-hidden />}
                </li>
              );
            })}
          </ul>
        </PopoverContent>
      </Popover>
      <Input
        id={id}
        type="tel"
        ref={(el) => {
          numberRef.current = el;
          inputRef?.(el);
        }}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^\d\s-]/g, ''))}
        placeholder={country.iso === 'IN' ? '98765 43210' : 'Phone number'}
        autoComplete="tel-national"
        inputMode="numeric"
        maxLength={18}
        disabled={disabled}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        className={cn(inputClass, 'min-w-0 flex-1', invalid && errorInputClass)}
      />
    </div>
  );
};
