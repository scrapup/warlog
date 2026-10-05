import { describe, expect, it } from '@jest/globals';
import { join } from 'node:path';
import { isWarlogError } from '../../../../src/core/errors/warlog-error.ts';
import { substitute } from '../../../../src/domain/template/template-substitution.ts';
import { trackerHarness } from '../../../support/tracker-harness.ts';
import { container, failure } from '../../../support/tracker-setup.ts';

describe('template substitution', () => {
  it('[WL-10] replaces known {name} placeholders literally and reports the rest', () => {
    expect(substitute('RT {feature} for {area} and {feature}', { feature: 'checkout' })).toEqual({ text: 'RT checkout for {area} and checkout', unresolved: ['area'] });
    expect(substitute('{a b} {} {{x}} } {', { x: '1' })).toEqual({ text: '{a b} {} {1} } {', unresolved: [] });
    expect(substitute('no placeholders', {})).toEqual({ text: 'no placeholders', unresolved: [] });
    expect(substitute('{constructor}', {})).toEqual({ text: '{constructor}', unresolved: ['constructor'] });
  });

  it('[WL-48] substitution stays linear on adversarial input', () => {
    const text = '}'.repeat(20_000) + '{'.repeat(20_000);
    expect(substitute(text, {}).text).toBe(text);
  });
});

describe.each(['lazy', 'live'] as const)('template operations (%s index)', (mode) => {
  it('[WL-10] templates are created globally, listed, updated in place and soft-deleted', async () => {
    const h = trackerHarness({ mode });
    const t = await h.obj('template_create', { name: 'rt', description: 'cycle', tasks: [{ title: 'RT-01 {f}' }, { title: 'RT-02', priority: 'high', estimated_hours: 2, tags: ['x'] }] });
    expect(t).toMatchObject({ name: 'rt', description: 'cycle', tasks: [{ title: 'RT-01 {f}', priority: 'medium' }, { title: 'RT-02', priority: 'high' }] });
    expect([...h.fs.files.keys()].some((p) => p.startsWith(join(h.roots.global, 'templates')))).toBe(true);
    expect(h.activityRecords().at(-1)).toMatchObject({ entity_type: 'template', summary: "Template 'rt' created with 2 task(s)" });
    expect(isWarlogError(await failure(h.call('template_create', { name: 'rt', tasks: [{ title: 'x' }] })), 'VALIDATION')).toBe(true);
    expect(isWarlogError(await failure(h.call('template_create', { name: 'empty', tasks: [] })), 'VALIDATION')).toBe(true);
    const rows = await h.rows('template_list');
    expect(rows).toEqual([expect.objectContaining({ name: 'rt', task_count: 2 })]);
    expect(rows[0]).not.toHaveProperty('tasks');
    expect((await h.rows('template_list', { include_tasks: true }))[0]?.['tasks']).toHaveLength(2);
    const updated = await h.obj('template_update', { id: t['id'], name: 'rt2', tasks: [{ title: 'only' }] });
    expect(updated).toMatchObject({ id: t['id'], name: 'rt2', tasks: [{ title: 'only', priority: 'medium' }], rev: 2 });
    expect(h.activityRecords().at(-1)?.['summary']).toBe("Template 'rt2' updated: name, tasks (1)");
    expect(isWarlogError(await failure(h.call('template_update', { id: t['id'] })), 'VALIDATION')).toBe(true);
    const other = await h.obj('template_create', { name: 'other', tasks: [{ title: 'x' }] });
    expect(isWarlogError(await failure(h.call('template_update', { id: other['id'], name: 'rt2' })), 'VALIDATION')).toBe(true);
    expect(await h.obj('template_update', { id: other['id'], description: 'd' })).toMatchObject({ description: 'd' });
    expect(await h.obj('template_delete', { id: t['id'] })).toEqual({ message: "Template 'rt2' deleted" });
    expect(await h.obj('template_delete', { id: t['id'] })).toEqual({ message: "Template 'rt2' deleted" });
    expect((await h.rows('template_list')).map((r) => r['name'])).toEqual(['other']);
    expect(await h.obj('template_create', { name: 'rt2', tasks: [{ title: 'reuse' }] })).toMatchObject({ name: 'rt2' });
  });

  it('[WL-10] template_apply creates the tasks in the epic with placeholders filled', async () => {
    const h = trackerHarness({ mode });
    const { epicId } = await container(h);
    const t = await h.obj('template_create', { name: 'rt', tasks: [{ title: 'RT-01 {feature}', description: 'for {feature} in {area}', estimated_hours: 3 }, { title: 'RT-02 {feature}', priority: 'high', tags: ['t'] }] });
    const applied = await h.obj('template_apply', { template_id: t['id'], epic_id: epicId, variables: { feature: 'pay' } });
    expect(applied).toMatchObject({ message: "Applied template 'rt' to epic 'E'", template_name: 'rt', epic_name: 'E', tasks_created: 2, unresolved: ['area'] });
    expect((applied['tasks'] as Record<string, unknown>[])[0]).toMatchObject({ title: 'RT-01 pay', description: 'for pay in {area}', estimated_hours: 3, status: 'todo', epic_id: epicId });
    expect((await h.rows('task_list', { epic_id: epicId })).map((r) => r['title'])).toEqual(['RT-02 pay', 'RT-01 pay']);
    const bare = await h.obj('template_apply', { template_id: t['id'], epic_id: epicId });
    expect(bare['unresolved']).toEqual(['feature', 'area']);
    await h.call('template_delete', { id: t['id'] });
    expect(isWarlogError(await failure(h.call('template_apply', { template_id: t['id'], epic_id: epicId })), 'NOT_FOUND')).toBe(true);
    expect(isWarlogError(await failure(h.call('template_apply', { template_id: '01J00000000000000000000099', epic_id: epicId })), 'NOT_FOUND')).toBe(true);
  });

  it('[WL-10] templates work outside a repository', async () => {
    const h = trackerHarness({ mode, withRepository: false });
    expect(await h.obj('template_create', { name: 'g', tasks: [{ title: 'x' }] })).toMatchObject({ name: 'g' });
    expect(h.activityRecords()[0]).not.toHaveProperty('repo_key');
  });
});
