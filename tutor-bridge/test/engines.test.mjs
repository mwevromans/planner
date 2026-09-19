import { test } from 'node:test';
import assert from 'node:assert/strict';
import { claudeArgs, codexArgs, createEngines, parseClaude, parseCodex } from '../engines.mjs';

test('claudeArgs: tools uit, geen instellingen, systeemprompt-bestand, resume alleen bij vervolg', () => {
  const a = claudeArgs({ systemPromptFile: '/tmp/s.md', message: 'hoi', sessionId: null, model: 'sonnet' });
  assert.deepEqual(a, ['-p', '--output-format', 'json', '--model', 'sonnet', '--setting-sources', '', '--tools', '', '--system-prompt-file', '/tmp/s.md', 'hoi']);
  const b = claudeArgs({ systemPromptFile: '/tmp/s.md', message: 'en dan?', sessionId: 'abc', model: 'sonnet' });
  assert.ok(b.includes('--resume') && b.includes('abc'));
  assert.equal(b.at(-1), 'en dan?');
});

test('parseClaude leest result en session_id, gooit bij is_error', () => {
  assert.deepEqual(parseClaude(JSON.stringify({ result: ' Hoi! ', session_id: 's1' })), { reply: 'Hoi!', sessionId: 's1' });
  assert.throws(() => parseClaude(JSON.stringify({ is_error: true, result: 'kapot' })), /kapot/);
});

test('codexArgs: eerste bericht bevat instructie, vervolg via resume met alleen de vraag', () => {
  const first = codexArgs({ systemPrompt: 'REGELS', message: 'hoi', sessionId: null, model: '', workdir: '/w' });
  assert.equal(first[0], 'exec');
  assert.ok(first.includes('--json') && first.includes('read-only') && first.includes('/w'));
  assert.match(first.at(-1), /^REGELS[\s\S]*Het kind zegt:\n\nhoi$/);
  const next = codexArgs({ systemPrompt: 'REGELS', message: 'en dan?', sessionId: 't1', model: 'gpt-5', workdir: '/w' });
  assert.deepEqual(next.slice(0, 2), ['exec', 'resume']);
  assert.ok(!next.includes('--sandbox') && !next.includes('-C'), 'resume kent geen sandbox of -C');
  assert.ok(first.includes('--ignore-user-config') && next.includes('--ignore-rules'));
  assert.ok(next.includes('-m') && next.includes('gpt-5'));
  assert.deepEqual(next.slice(-2), ['t1', 'en dan?']);
  assert.ok(!next.join(' ').includes('REGELS'));
});

test('parseCodex haalt thread-id en laatste agent_message uit JSONL', () => {
  const out = [
    JSON.stringify({ type: 'thread.started', thread_id: 'th-9' }),
    JSON.stringify({ type: 'item.completed', item: { type: 'reasoning', text: 'denk' } }),
    JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: 'Wat weet je al? ' } }),
    JSON.stringify({ type: 'turn.completed', usage: {} }),
  ].join('\n');
  assert.deepEqual(parseCodex(out), { reply: 'Wat weet je al?', sessionId: 'th-9' });
  assert.throws(() => parseCodex(JSON.stringify({ type: 'turn.failed', error: { message: 'limiet' } })), /limiet/);
  assert.throws(() => parseCodex(''), /Geen antwoord/);
});

test('engines gebruiken de injecteerbare runner en geven reply + sessionId terug', async () => {
  const calls = [];
  const run = async (cmd, args, opts) => {
    calls.push({ cmd, args, cwd: opts.cwd });
    if (cmd === 'claude') return { code: 0, stdout: JSON.stringify({ result: 'Vraag terug?', session_id: 'c1' }), stderr: '' };
    return { code: 0, stdout: JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: 'Hint.' }, thread_id: 'x1' }), stderr: '' };
  };
  const e = createEngines({ run, workdir: '/w' });
  assert.deepEqual(await e.claude({ systemPrompt: 'R', message: 'm', sessionId: null }), { reply: 'Vraag terug?', sessionId: 'c1' });
  assert.deepEqual(await e.codex({ systemPrompt: 'R', message: 'm', sessionId: null }), { reply: 'Hint.', sessionId: 'x1' });
  assert.equal(calls[0].cmd, 'claude');
  assert.equal(calls[0].cwd, '/w');
  assert.equal(calls[1].cmd, 'codex');
});
