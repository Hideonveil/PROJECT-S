import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(process.cwd(), 'deploy/ops-v2/appsmith');
const manifest = resolve(root, 'JIYUAN_OPS_V2.md');
const importDir = resolve(root, 'import');

describe('local Appsmith OPS V2 artifact', () => {
  it('declares the protected operations contract without secrets', () => {
    const source = readFileSync(manifest, 'utf8');

    expect(source).toContain('JIYUAN OPS V2');
    expect(source).toContain('LIVE');
    expect(source).toContain('USERS');
    expect(source).toContain('ROOMS');
    expect(source).toContain('CONTACTS');
    expect(source).toContain('MANUAL MATCH');
    expect(source).toContain('ADMIN_FORCE_RANKED_MATCH');
    expect(source).toContain('ADMIN_ATTACH_CASUAL_USER');
    expect(source).toContain('ADMIN_LOCK_CASUAL_ROOM');
    expect(source).not.toMatch(/service[_ -]?role/i);
    expect(source).not.toMatch(/access[_ -]?token|refresh[_ -]?token|password\s*[:=]/i);
  });

  it('contains importable page and datasource artifacts', () => {
    const files = readdirSync(importDir).sort();

    expect(files).toEqual(expect.arrayContaining([
      'datasource.json',
      'live.json',
      'users.json',
      'rooms.json',
      'contacts.json',
      'manual-match.json',
    ]));

    for (const file of files) {
      expect(readFileSync(resolve(importDir, file), 'utf8')).not.toMatch(/service[_ -]?role/i);
    }
  });

  it('requires preview before every manual mutation', () => {
    const source = readFileSync(manifest, 'utf8');

    expect(source).toContain('Preview before Force');
    expect(source).toContain('operator reason');
    expect(source).toContain('x-jiyuan-ops-key');
    expect(source).toContain('No direct database datasource');
  });
});
