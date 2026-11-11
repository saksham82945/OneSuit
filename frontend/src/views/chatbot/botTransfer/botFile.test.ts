import { describe, expect, it } from 'vitest';
import { AI_PROMPT_TEMPLATE, SAMPLE_BOT_FILE, botFileName, parseBotFileText, reportProblemCount } from './botFile';

describe('bot file helpers', () => {
  it('names export files onesuit-bots-YYYY-MM-DD.json', () => {
    expect(botFileName(new Date(2026, 0, 5))).toBe('onesuit-bots-2026-01-05.json');
  });

  it('parses JSON, also inside ``` fences', () => {
    expect(parseBotFileText('{"onesuit_bot_format":1}')).toEqual({ value: { onesuit_bot_format: 1 } });
    expect(parseBotFileText('```json\n{"flows":[]}\n```')).toEqual({ value: { flows: [] } });
    expect('error' in parseBotFileText('{oops')).toBe(true);
    expect('error' in parseBotFileText('[1,2]')).toBe(true);
    expect('error' in parseBotFileText('  ')).toBe(true);
  });

  it('counts report problems', () => {
    const item = { index: 0, name: 'a', final_name: 'a', action: 'error' as const, kind: 'text', errors: ['x', 'y'], warnings: [] };
    expect(
      reportProblemCount({
        preview: true, imported: false, valid: false, errors: ['file'], warnings: [],
        flows: [item], keyword_bots: [{ ...item, errors: ['z'] }], created: { flows: 0, keyword_bots: 0 },
      }),
    ).toBe(4);
  });
});

describe('sample bot file', () => {
  it('has one flow of each type and every keyword bot kind', () => {
    expect(SAMPLE_BOT_FILE.onesuit_bot_format).toBe(1);
    expect(SAMPLE_BOT_FILE.flows?.map((f) => f.flow_type).sort()).toEqual(['advanced', 'media', 'simple']);
    expect(SAMPLE_BOT_FILE.keyword_bots?.map((k) => k.response_type).sort()).toEqual(['flow', 'text', 'transfer']);
  });

  it('only points flow_ref at flows in the file and edges at existing steps', () => {
    const names = new Set(SAMPLE_BOT_FILE.flows?.map((f) => f.name));
    for (const k of SAMPLE_BOT_FILE.keyword_bots || []) {
      if (k.response_type === 'flow') expect(names.has(k.flow_ref || '')).toBe(true);
    }
    for (const f of SAMPLE_BOT_FILE.flows || []) {
      const ids = new Set(f.graph?.nodes.map((n) => n.id));
      expect(ids.has(f.graph?.entry_node || '')).toBe(true);
      for (const e of f.graph?.edges || []) {
        expect(ids.has(e.from) && ids.has(e.to)).toBe(true);
      }
    }
  });

  it('gives the AI prompt a parseable example', () => {
    const example = AI_PROMPT_TEMPLATE.slice(AI_PROMPT_TEMPLATE.indexOf('EXAMPLE') + 'EXAMPLE'.length);
    const parsed = parseBotFileText(example);
    expect('value' in parsed).toBe(true);
  });
});
