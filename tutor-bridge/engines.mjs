import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/**
 * Voert een commando uit en geeft stdout/stderr terug. Injecteerbaar voor tests.
 * @type {(cmd: string, args: string[], opts: {cwd: string, timeoutMs: number, env?: NodeJS.ProcessEnv}) => Promise<{code: number|null, stdout: string, stderr: string}>}
 */
export function runProcess(cmd, args, { cwd, timeoutMs, env }) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error(`Time-out na ${timeoutMs / 1000}s`)); }, timeoutMs);
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('error', (e) => { clearTimeout(timer); reject(e); });
    child.on('close', (code) => { clearTimeout(timer); resolve({ code, stdout, stderr }); });
  });
}

/** Bouwt de argumenten voor claude -p. Puur, testbaar. */
export function claudeArgs({ systemPromptFile, message, sessionId, model }) {
  const args = ['-p', '--output-format', 'json', '--model', model, '--setting-sources', '', '--tools', '', '--system-prompt-file', systemPromptFile];
  if (sessionId) args.push('--resume', sessionId);
  args.push(message);
  return args;
}

/** Leest het antwoord en sessie-id uit de JSON-uitvoer van claude -p. */
export function parseClaude(stdout) {
  const d = JSON.parse(stdout);
  if (d.is_error) throw new Error(d.result || 'Claude gaf een fout');
  return { reply: String(d.result ?? '').trim(), sessionId: d.session_id ?? null };
}

/**
 * Bouwt de argumenten voor codex exec. Codex kent geen systeemprompt-vlag: bij een nieuw
 * gesprek gaat de instructie mee in het eerste bericht, daarna alleen de vraag.
 */
export function codexArgs({ systemPrompt, message, sessionId, model, workdir }) {
  const common = ['--json', '--skip-git-repo-check', '--ignore-user-config', '--ignore-rules'];
  if (model) common.push('-m', model);
  // resume kent geen -C of --sandbox; de werkmap komt van het proces, de sandbox van de oorspronkelijke sessie.
  if (sessionId) return ['exec', 'resume', ...common, sessionId, message];
  const first = `${systemPrompt}\n\n---\nHieronder begint het gesprek. Het kind zegt:\n\n${message}`;
  return ['exec', ...common, '--sandbox', 'read-only', '-C', workdir, first];
}

/** Leest thread-id en laatste assistent-bericht uit de JSONL-uitvoer van codex exec. */
export function parseCodex(stdout) {
  let threadId = null;
  let reply = '';
  for (const line of stdout.split('\n')) {
    if (!line.trim()) continue;
    let ev;
    try { ev = JSON.parse(line); } catch { continue; }
    if (ev.thread_id) threadId = ev.thread_id;
    if (ev.type === 'thread.started' && ev.thread_id) threadId = ev.thread_id;
    if (ev.type === 'item.completed' && ev.item?.type === 'agent_message' && ev.item.text) reply = String(ev.item.text).trim();
    if (ev.type === 'error' || ev.type === 'turn.failed') throw new Error(ev.message || ev.error?.message || 'Codex gaf een fout');
  }
  if (!reply) throw new Error('Geen antwoord van Codex gevonden in de uitvoer');
  return { reply, sessionId: threadId };
}

export function createEngines({ run = runProcess, workdir, timeoutMs = 90_000, claudeModel = 'sonnet', codexModel = '' } = {}) {
  return {
    async claude({ systemPrompt, message, sessionId }) {
      const dir = mkdtempSync(path.join(tmpdir(), 'tutor-'));
      const file = path.join(dir, 'system.md');
      writeFileSync(file, systemPrompt);
      const r = await run('claude', claudeArgs({ systemPromptFile: file, message, sessionId, model: claudeModel }), { cwd: workdir, timeoutMs });
      if (r.code !== 0 && !r.stdout.trim()) throw new Error(`claude eindigde met code ${r.code}: ${r.stderr.slice(0, 300)}`);
      return parseClaude(r.stdout);
    },
    async codex({ systemPrompt, message, sessionId }) {
      const r = await run('codex', codexArgs({ systemPrompt, message, sessionId, model: codexModel, workdir }), { cwd: workdir, timeoutMs });
      if (r.code !== 0 && !r.stdout.trim()) throw new Error(`codex eindigde met code ${r.code}: ${r.stderr.slice(0, 300)}`);
      return parseCodex(r.stdout);
    },
  };
}
