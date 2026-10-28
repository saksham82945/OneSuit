import React, { useState, useMemo } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Check, ChevronsUpDown, Clock, Search } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface TimezoneOption {
  value: string;
  label: string;
  offsetMinutes: number;
  offsetDisplay: string;
}

// Fallback zones if Intl.supportedValuesOf is not supported
const FALLBACK_ZONES = [
  'UTC',
  'Africa/Cairo',
  'Africa/Johannesburg',
  'Africa/Lagos',
  'Africa/Nairobi',
  'America/Anchorage',
  'America/Argentina/Buenos_Aires',
  'America/Bogota',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Mexico_City',
  'America/New_York',
  'America/Phoenix',
  'America/Santiago',
  'America/Sao_Paulo',
  'America/Toronto',
  'America/Vancouver',
  'Asia/Bangkok',
  'Asia/Dhaka',
  'Asia/Dubai',
  'Asia/Hong_Kong',
  'Asia/Jakarta',
  'Asia/Jerusalem',
  'Asia/Karachi',
  'Asia/Kolkata',
  'Asia/Kuala_Lumpur',
  'Asia/Manila',
  'Asia/Riyadh',
  'Asia/Seoul',
  'Asia/Shanghai',
  'Asia/Singapore',
  'Asia/Taipei',
  'Asia/Tokyo',
  'Atlantic/Reykjavik',
  'Australia/Adelaide',
  'Australia/Brisbane',
  'Australia/Melbourne',
  'Australia/Perth',
  'Australia/Sydney',
  'Europe/Amsterdam',
  'Europe/Athens',
  'Europe/Berlin',
  'Europe/Brussels',
  'Europe/Dublin',
  'Europe/Helsinki',
  'Europe/Istanbul',
  'Europe/Lisbon',
  'Europe/London',
  'Europe/Madrid',
  'Europe/Moscow',
  'Europe/Paris',
  'Europe/Rome',
  'Europe/Stockholm',
  'Europe/Vienna',
  'Europe/Warsaw',
  'Europe/Zurich',
  'Pacific/Auckland',
  'Pacific/Fiji',
  'Pacific/Honolulu',
];

function getUtcOffset(timeZone: string): { offsetMinutes: number; display: string } {
  try {
    const now = new Date();
    const utcDate = new Date(now.toLocaleString('en-US', { timeZone: 'UTC' }));
    const tzDate = new Date(now.toLocaleString('en-US', { timeZone }));
    const diffMinutes = Math.round((tzDate.getTime() - utcDate.getTime()) / 60000);
    const sign = diffMinutes >= 0 ? '+' : '-';
    const absMinutes = Math.abs(diffMinutes);
    const hours = Math.floor(absMinutes / 60);
    const minutes = absMinutes % 60;
    const pad = (n: number) => String(n).padStart(2, '0');
    return {
      offsetMinutes: diffMinutes,
      display: `UTC${sign}${pad(hours)}:${pad(minutes)}`,
    };
  } catch {
    return { offsetMinutes: 0, display: 'UTC+00:00' };
  }
}

export function getAllTimezones(): TimezoneOption[] {
  let rawZones: string[] = [];
  try {
    if (typeof Intl !== 'undefined' && 'supportedValuesOf' in Intl) {
      rawZones = (Intl as unknown as { supportedValuesOf: (key: string) => string[] }).supportedValuesOf('timeZone');
    }
  } catch {
    // ignore
  }

  if (!rawZones || rawZones.length === 0) {
    rawZones = FALLBACK_ZONES;
  }

  // Ensure UTC is present
  if (!rawZones.includes('UTC')) {
    rawZones.unshift('UTC');
  }

  return rawZones.map((tz) => {
    const { offsetMinutes, display } = getUtcOffset(tz);
    return {
      value: tz,
      offsetMinutes,
      offsetDisplay: display,
      label: `(${display}) ${tz}`,
    };
  }).sort((a, b) => {
    if (a.offsetMinutes !== b.offsetMinutes) {
      return a.offsetMinutes - b.offsetMinutes;
    }
    return a.value.localeCompare(b.value);
  });
}

interface TimezonePickerProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  disabled?: boolean;
}

export const TimezonePicker: React.FC<TimezonePickerProps> = ({
  value,
  onChange,
  className,
  disabled = false,
}) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const allZones = useMemo(() => getAllTimezones(), []);

  const selectedZone = useMemo(() => {
    const found = allZones.find((z) => z.value === value);
    if (found) return found;
    if (value) {
      const { offsetMinutes, display } = getUtcOffset(value);
      return {
        value,
        offsetMinutes,
        offsetDisplay: display,
        label: `(${display}) ${value}`,
      };
    }
    return allZones.find((z) => z.value === 'UTC') || allZones[0];
  }, [allZones, value]);

  const filteredZones = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allZones;
    return allZones.filter(
      (z) =>
        z.value.toLowerCase().includes(q) ||
        z.offsetDisplay.toLowerCase().includes(q) ||
        z.label.toLowerCase().includes(q)
    );
  }, [allZones, search]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            'w-full justify-between font-normal text-xs h-9 border-white/[0.08] bg-white/[0.04] text-white hover:bg-white/[0.08] light:bg-white light:border-gray-200 light:text-gray-900 light:hover:bg-gray-100',
            className
          )}
        >
          <span className="flex items-center gap-2 truncate">
            <Clock className="h-3.5 w-3.5 text-white/40 shrink-0 light:text-gray-400" />
            <span className="truncate">{selectedZone ? selectedZone.label : 'Select timezone…'}</span>
          </span>
          <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[380px] p-0 bg-[#141415] border-white/[0.08] light:bg-white light:border-gray-200" align="start">
        <div className="flex items-center border-b border-white/[0.08] px-3 py-2 light:border-gray-200">
          <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
          <Input
            placeholder="Search timezone (e.g. Kolkata, London, UTC)..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 border-0 bg-transparent p-0 text-xs focus-visible:ring-0 placeholder:text-white/40 light:placeholder:text-gray-400"
            autoFocus
          />
        </div>
        <ScrollArea className="h-64 p-1">
          {filteredZones.length === 0 ? (
            <div className="py-6 text-center text-xs text-white/40 light:text-gray-500">
              No matching timezone found
            </div>
          ) : (
            <div className="space-y-0.5">
              {filteredZones.map((z) => {
                const isSelected = z.value === value;
                return (
                  <button
                    key={z.value}
                    type="button"
                    onClick={() => {
                      onChange(z.value);
                      setOpen(false);
                      setSearch('');
                    }}
                    className={cn(
                      'flex w-full items-center justify-between rounded px-2.5 py-1.5 text-xs transition-colors text-left',
                      isSelected
                        ? 'bg-violet-600/20 text-violet-300 font-medium light:bg-violet-50 light:text-violet-700'
                        : 'text-white/80 hover:bg-white/[0.06] hover:text-white light:text-gray-700 light:hover:bg-gray-100 light:hover:text-gray-900'
                    )}
                  >
                    <span className="truncate">{z.label}</span>
                    {isSelected && <Check className="ml-2 h-3.5 w-3.5 text-violet-400 shrink-0" />}
                  </button>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
};
