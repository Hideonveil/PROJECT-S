import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const questionsDir = join(process.cwd(), 'deploy/ops-v2/metabase/questions');

function readQuestions() {
  return readdirSync(questionsDir)
    .filter((name) => name.endsWith('.sql'))
    .sort()
    .map((name) => readFileSync(join(questionsDir, name), 'utf8'));
}

describe('local Metabase question collection', () => {
  it('provides the LIVE collection without writes or synthetic-account leakage', () => {
    const live = readFileSync(join(questionsDir, 'live.sql'), 'utf8');

    expect(live).toMatch(/is_synthetic/i);
    expect(live).toMatch(/analytics\.user_facts/i);
    expect(live).not.toMatch(/auth\.users/i);
    expect(live).toMatch(/last 5 minutes/i);
    expect(live).toMatch(/select/i);
    expect(live).not.toMatch(/\b(insert|update|delete)\b/i);
  });

  it('provides the GROWTH collection with synthetic exclusion and read-only SQL', () => {
    const growth = readFileSync(join(questionsDir, 'growth.sql'), 'utf8');

    expect(growth).toMatch(/is_synthetic/i);
    expect(growth).toMatch(/analytics\.user_facts/i);
    expect(growth).not.toMatch(/auth\.users/i);
    expect(growth).toMatch(/d1|d3|d7/i);
    expect(growth).toMatch(/select/i);
    expect(growth).not.toMatch(/\b(insert|update|delete)\b/i);
  });

  it('documents the SSH-tunnel and no-data contract', () => {
    const readme = readFileSync(join(process.cwd(), 'deploy/ops-v2/metabase/README.md'), 'utf8');

    expect(readme).toMatch(/SSH\s+tunnel/);
    expect(readme).toMatch(/analytics_readonly/i);
    expect(readme).toMatch(/NO DATA/i);
    expect(readme).toMatch(/JIYUAN LIVE/);
    expect(readme).toMatch(/JIYUAN GROWTH/);
  });

  it('keeps every question SELECT-only', () => {
    for (const sql of readQuestions()) {
      expect(sql).toMatch(/^\s*(--[^\n]*\n\s*)*(select|with)\b/i);
      expect(sql).not.toMatch(/\b(insert|update|delete|drop|alter|create|truncate)\b/i);
    }
  });

  it('provides a narrow analytics fact view instead of granting Auth access', () => {
    const migration = readFileSync(join(process.cwd(), 'supabase/migrations/20260827104000_ops_v2_analytics_facts.sql'), 'utf8');

    expect(migration).toMatch(/analytics\.user_facts/i);
    expect(migration).toMatch(/is_synthetic/i);
    expect(migration).toMatch(/revoke all on analytics\.user_facts/i);
  });
});
