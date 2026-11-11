import { describe, expect, it } from 'vitest';
import { FileText } from 'lucide-react';
import { dedupePaletteItems, filterPaletteItems, type PaletteItem } from './commandPaletteSearch';

const item = (id: string, label: string, group = 'Pages', keywords?: string): PaletteItem => ({
  id,
  label,
  group,
  icon: FileText,
  path: id,
  keywords,
});

const items = [
  item('/settings/tags', 'Tags', 'Settings'),
  item('/templates', 'Templates'),
  item('/campaigns', 'Campaigns', 'Campaigns', 'broadcast'),
  item('/campaigns/analytics', 'Campaign Analytics', 'Campaigns'),
];

describe('filterPaletteItems', () => {
  it('returns everything for an empty query', () => {
    expect(filterPaletteItems(items, '  ')).toHaveLength(4);
  });

  it('ranks labels starting with the query first', () => {
    expect(filterPaletteItems(items, 'ta').map((i) => i.label)).toEqual(['Tags']);
    expect(filterPaletteItems(items, 'camp').map((i) => i.label)).toEqual(['Campaigns', 'Campaign Analytics']);
  });

  it('matches keywords, groups and every word', () => {
    expect(filterPaletteItems(items, 'broadcast').map((i) => i.label)).toEqual(['Campaigns']);
    expect(filterPaletteItems(items, 'settings tags').map((i) => i.label)).toEqual(['Tags']);
    expect(filterPaletteItems(items, 'analytics campaign').map((i) => i.label)).toEqual(['Campaign Analytics']);
    expect(filterPaletteItems(items, 'nothing here')).toEqual([]);
  });
});

describe('dedupePaletteItems', () => {
  it('keeps the first item per id', () => {
    const out = dedupePaletteItems([item('/a', 'A', 'One'), item('/a', 'A', 'Two'), item('/b', 'B')]);
    expect(out.map((i) => `${i.id}:${i.group}`)).toEqual(['/a:One', '/b:Pages']);
  });
});
