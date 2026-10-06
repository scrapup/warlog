import { describe, expect, it } from '@jest/globals';
import { trackerHarness } from '../../../support/tracker-harness.ts';
import { container, failure } from '../../../support/tracker-setup.ts';

describe('memory_supersede', () => {
  it('[WL-17] links both memories, and refuses to supersede a memory that is already replaced by another', async () => {
    const h = trackerHarness();
    await container(h);
    const old = await h.obj('memory_save', { kind: 'fact', title: 'old', content: 'a' });
    const next = await h.obj('memory_save', { kind: 'fact', title: 'new', content: 'b' });
    const other = await h.obj('memory_save', { kind: 'fact', title: 'other', content: 'c' });
    const result = await h.obj('memory_supersede', { id: old['id'], superseded_by: next['id'], reason: 'better' });
    expect(result).toMatchObject({ superseded: { status: 'superseded', superseded_by: next['id'] }, replacement: { links: [{ rel: 'supersedes', target: old['id'] }] } });
    await expect(h.call('memory_supersede', { id: old['id'], superseded_by: other['id'] })).rejects.toMatchObject({ code: 'VALIDATION' });
  });

  it('[WL-41] when the second write fails, calling again with the same ids completes the link instead of being refused', async () => {
    const h = trackerHarness();
    await container(h);
    const old = await h.obj('memory_save', { kind: 'fact', title: 'old', content: 'a' });
    const next = await h.obj('memory_save', { kind: 'fact', title: 'new', content: 'b' });
    const nextFile = [...h.fs.files.keys()].find((k) => k.includes(String(next['id'])) && k.includes('memories')) ?? '';
    h.fs.failWrites.add(nextFile);
    expect(await failure(h.call('memory_supersede', { id: old['id'], superseded_by: next['id'] }))).toMatchObject({ code: 'INTERNAL' });
    expect(await h.obj('memory_get', { id: old['id'] })).toMatchObject({ status: 'superseded' });
    expect((await h.obj('memory_get', { id: next['id'] }))['links'] ?? []).toEqual([]);
    h.fs.failWrites.delete(nextFile);
    const done = await h.obj('memory_supersede', { id: old['id'], superseded_by: next['id'] });
    expect(done).toMatchObject({ replacement: { links: [{ rel: 'supersedes', target: old['id'] }] } });
    const again = await h.obj('memory_supersede', { id: old['id'], superseded_by: next['id'] });
    expect(again).toMatchObject({ replacement: { links: [{ rel: 'supersedes', target: old['id'] }] } });
  });
});

describe('playbook and review over damaged activity files', () => {
  it('[WL-18] reports unreadable activity lines as a warning, since the status it derives is partial', async () => {
    const h = trackerHarness();
    await container(h);
    await h.obj('command_record', { cmd: 'npm test', outcome: 'ok', purpose: 'test' });
    const file = [...h.fs.files.keys()].find((k) => k.includes('activity') && k.endsWith('.jsonl')) ?? '';
    h.fs.files.set(file, `${h.fs.files.get(file) ?? ''}this is not json\n`);
    h.warnings.length = 0;
    await h.obj('playbook', { topic: 'test' });
    expect(h.warnings).toContain('activity.invalid_lines');
  });
});
