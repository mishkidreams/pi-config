import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const omitted = new Set(['.git', 'node_modules']);
async function filesUnder(directory = root) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (omitted.has(entry.name)) continue;
    const name = path.join(directory, entry.name);
    assert.equal(entry.isSymbolicLink(), false, 'Public source must not follow private symlinks');
    if (entry.isDirectory()) files.push(...await filesUnder(name));
    else if (entry.isFile()) files.push(name);
  }
  return files;
}

test('public Markdown links resolve inside the clean source and JSON fixtures parse', async () => {
  for (const filename of await filesUnder()) {
    if (filename.endsWith('.json')) JSON.parse(await readFile(filename, 'utf8'));
    if (!filename.endsWith('.md')) continue;
    const text = await readFile(filename, 'utf8');
    for (const match of text.matchAll(/\[[^\]]*\]\(([^\s)]+)(?:\s+"[^"]*")?\)/g)) {
      const href = match[1];
      if (/^(?:[a-z]+:|#|\{\{)/i.test(href)) continue;
      const local = decodeURIComponent(href.split('#')[0]);
      if (!local) continue;
      const target = path.resolve(path.dirname(filename), local);
      assert.ok(target === root || target.startsWith(root + path.sep), 'Public link escapes source: ' + href);
      await stat(target);
    }
    assert.equal((text.match(/^```/gm) ?? []).length % 2, 0, 'Unbalanced Markdown fence: ' + filename);
  }
});

test('the public source has no authenticated state, dependency tree or private archive payload', async () => {
  for (const filename of await filesUnder()) {
    const name = path.relative(root, filename).replaceAll('\\', '/');
    assert.doesNotMatch(name, /(?:^|\/)(?:auth\.json|mcp\.json|settings\.json|deviceId|profile-chromium)(?:\/|$)/i);
    assert.doesNotMatch(name, /\.(?:zip|jsonl|sqlite|db|tgz|pem|key)$/i);
  }
});
