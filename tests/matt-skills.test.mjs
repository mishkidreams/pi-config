import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, readdir, rm, mkdir, cp, realpath } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { buildMattSkills } from '../scripts/matt-skills.mjs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceDir = process.env.MATT_SOURCE ?? path.resolve(root, '../matt-pocock-skills');
const cli = path.join(root, 'scripts/matt-skills.mjs');
const sourceAvailable = spawnSync('git', ['-C', sourceDir, 'rev-parse', 'HEAD'], {encoding:'utf8'}).status === 0;
function run(destination, ...extra) {
  return spawnSync(process.execPath, [cli, '--source', sourceDir, '--destination', destination, ...extra], {encoding:'utf8'});
}
async function withDestination(fn) {
  const temporary = await mkdtemp(path.join(tmpdir(), 'pi-config-skills-'));
  try { await fn(path.join(temporary,'skills','matt-pocock'), temporary); }
  finally { await rm(temporary,{recursive:true,force:true}); }
}
test('plan is read-only and describes exactly the selected twenty native skills', {skip:!sourceAvailable}, async () => {
  await withDestination(async (destination, temporary) => {
    const result = run(destination);
    assert.equal(result.status,0,result.stderr);
    const plan = JSON.parse(result.stdout);
    assert.equal(plan.mode,'plan');
    assert.equal(plan.skills.length,20);
    assert.ok(plan.skills.includes('code-review'));
    assert.ok(!plan.skills.includes('pr'));
    assert.deepEqual(await readdir(temporary),[]);
  });
});
test('applied skills resolve external project storage and preserve original references', {skip:!sourceAvailable}, async () => {
  await withDestination(async destination => {
    const result = run(destination,'--apply');
    assert.equal(result.status,0,result.stderr);
    const manifest = JSON.parse(await readFile(path.join(destination,'PROVENANCE.json'),'utf8'));
    assert.equal(manifest.adaptation,'pi-native-v2');
    assert.equal(manifest.skills.length,20);
    for (const name of manifest.skills) {
      const body = await readFile(path.join(destination,name,'SKILL.md'),'utf8');
      assert.match(body,/PI-COMPATIBILITY\.md/);
      assert.match(body,/PROJECT-CONTEXT\.md/);
    }
    for (const file of manifest.files.filter(file => file.path.endsWith('.md'))) {
      assert.doesNotMatch(await readFile(path.join(destination,file.path),'utf8'),/\bSkill tool\b/i,file.path+' must use native file loading, not a nonexistent tool');
    }
    const combined = await readFile(path.join(destination,'grill-with-docs','SKILL.md'),'utf8');
    assert.match(combined,/\[grilling\]\(\.\.\/grilling\/SKILL\.md\)/);
    assert.match(combined,/\[domain-modeling\]\(\.\.\/domain-modeling\/SKILL\.md\)/);
    const setup = await readFile(path.join(destination,'setup-matt-pocock-skills','SKILL.md'),'utf8');
    assert.match(setup,/project-context\.mjs/);
    assert.doesNotMatch(setup,/Record the choice in `docs\/agents/);
    const implement = await readFile(path.join(destination,'implement','SKILL.md'),'utf8');
    assert.doesNotMatch(implement,/^Commit your work to the current branch\.$/m);
    const review = await readFile(path.join(destination,'code-review','SKILL.md'),'utf8');
    assert.match(review,/untracked/);
    assert.match(review,/working.tree/i);
    const references = await readFile(path.join(destination,'domain-modeling','ADR-FORMAT.md'),'utf8');
    assert.match(references,/PROJECT-CONTEXT\.md/);
    assert.match(await readFile(path.join(destination,'LICENSE'),'utf8'),/MIT License/);
  });
});
test('repeat install is idempotent and refuses locally modified managed skills', {skip:!sourceAvailable}, async () => {
  await withDestination(async destination => {
    assert.equal(run(destination,'--apply').status,0);
    const before = await readFile(path.join(destination,'PROVENANCE.json'),'utf8');
    const repeated = run(destination,'--apply');
    assert.equal(repeated.status,0,repeated.stderr);
    assert.equal(JSON.parse(repeated.stdout).changed,false);
    assert.equal(await readFile(path.join(destination,'PROVENANCE.json'),'utf8'),before);
    const target = path.join(destination,'tdd','SKILL.md');
    await writeFile(target,(await readFile(target,'utf8'))+'\nPrivate local customization\n');
    const refused = run(destination,'--apply');
    assert.notEqual(refused.status,0);
    assert.match(refused.stderr,/modified|drift/i);
    assert.match(await readFile(target,'utf8'),/Private local customization/);
  });
});
test('unknown files are retained and stop an update rather than disappearing', {skip:!sourceAvailable}, async () => {
  await withDestination(async destination => {
    assert.equal(run(destination,'--apply').status,0);
    await writeFile(path.join(destination,'local-only.md'),'private');
    const refused = run(destination,'--apply');
    assert.notEqual(refused.status,0);
    assert.equal(await readFile(path.join(destination,'local-only.md'),'utf8'),'private');
  });
});
async function withSource(fn) {
  const temporary = await mkdtemp(path.join(tmpdir(), 'pi-config-source-'));
  try {
    const checkout = path.join(temporary, 'source');
    const cloned = spawnSync('git', ['clone', '--quiet', '--shared', sourceDir, checkout], { encoding: 'utf8' });
    assert.equal(cloned.status, 0, cloned.stderr);
    const remote = spawnSync('git', ['-C', checkout, 'remote', 'set-url', 'origin', 'https://github.com/mattpocock/skills.git'], { encoding: 'utf8' });
    assert.equal(remote.status, 0, remote.stderr);
    await fn(checkout, temporary);
  } finally { await rm(temporary, { recursive: true, force: true }); }
}
function runSource(source, destination, env = process.env) {
  return spawnSync(process.execPath, [cli, '--source', source, '--destination', destination], { encoding: 'utf8', env });
}
test('only the canonical pinned checkout root can supply skill sources, not an ignored copied subtree', {skip:!sourceAvailable}, async () => {
  await withSource(async (checkout, temporary) => {
    const ignored = path.join(checkout, 'ignored-copy');
    await cp(path.join(checkout, 'skills'), path.join(ignored, 'skills'), { recursive: true });
    await cp(path.join(checkout, 'LICENSE'), path.join(ignored, 'LICENSE'));
    await writeFile(path.join(checkout, '.git', 'info', 'exclude'), '\nignored-copy/\n');
    const result = runSource(ignored, path.join(temporary, 'destination', 'matt-pocock'));
    assert.notEqual(result.status, 0, 'Enclosing repository identity must not authenticate copied skill files');
  });
});
test('inherited Git redirects cannot authenticate a forged source directory', {skip:!sourceAvailable}, async () => {
  await withSource(async (checkout, temporary) => {
    const forged = path.join(temporary, 'forged');
    await cp(path.join(checkout, 'skills'), path.join(forged, 'skills'), { recursive: true });
    await cp(path.join(checkout, 'LICENSE'), path.join(forged, 'LICENSE'));
    const result = runSource(forged, path.join(temporary, 'destination', 'matt-pocock'), {
      ...process.env, GIT_DIR: path.join(checkout, '.git'), GIT_WORK_TREE: checkout,
    });
    assert.notEqual(result.status, 0, 'Git environment must not redirect source validation to another checkout');
  });
});
test('ignored private source files are not included in pinned generated skills or provenance', {skip:!sourceAvailable}, async () => {
  await withSource(async checkout => {
    const relative = 'skills/engineering/tdd/private-note.md';
    await writeFile(path.join(checkout, '.git', 'info', 'exclude'), '\n' + relative + '\n');
    await writeFile(path.join(checkout, relative), 'Private synthetic note that is not an upstream blob.\n');
    const { output, manifest } = await buildMattSkills({ sourceDir: checkout });
    assert.equal(output.has('tdd/private-note.md'), false);
    assert.equal(manifest.upstreamFiles.some(file => file.path === relative), false);
  });
});
test('foreign provenance does not establish updater ownership', {skip:!sourceAvailable}, async () => {
  for (const [field, value] of [['schemaVersion', 999], ['adaptation', 'foreign'], ['upstream', 'https://example.invalid/other.git']]) {
    await withDestination(async destination => {
      assert.equal(run(destination, '--apply').status, 0);
      const filename = path.join(destination, 'PROVENANCE.json');
      const manifest = JSON.parse(await readFile(filename, 'utf8'));
      manifest[field] = value;
      const foreign = JSON.stringify(manifest);
      await writeFile(filename, foreign);
      const result = run(destination, '--apply');
      assert.notEqual(result.status, 0, 'Foreign ' + field + ' must not authorize replacement');
      assert.equal(await readFile(filename, 'utf8'), foreign);
    });
  }
});
test('updates keep durable same-volume backups outside skill discovery', {skip:!sourceAvailable}, async () => {
  await withDestination(async (destination, temporary) => {
    assert.equal(run(destination, '--apply').status, 0);
    const filename = path.join(destination, 'PROJECT-CONTEXT.md');
    const old = (await readFile(filename, 'utf8')) + '\nPrevious generated version.\n';
    await writeFile(filename, old);
    const manifestFile = path.join(destination, 'PROVENANCE.json');
    const manifest = JSON.parse(await readFile(manifestFile, 'utf8'));
    manifest.files.find(file => file.path === 'PROJECT-CONTEXT.md').sha256 = createHash('sha256').update(old).digest('hex');
    await writeFile(manifestFile, JSON.stringify(manifest));
    const result = run(destination, '--apply');
    assert.equal(result.status, 0, result.stderr);
    const backup = JSON.parse(result.stdout).backup;
    assert.equal(await readFile(path.join(backup, 'PROJECT-CONTEXT.md'), 'utf8'), old);
    assert.equal(await realpath(path.dirname(backup)), path.join(await realpath(temporary), '.pi-config-state', 'backups'));
    assert.deepEqual(await readdir(path.dirname(destination)), ['matt-pocock']);
  });
});
async function markPreviousGeneration(destination) {
  const filename = path.join(destination, 'PROJECT-CONTEXT.md');
  const previous = (await readFile(filename, 'utf8')) + '\nPrevious synthetic generation.\n';
  await writeFile(filename, previous);
  const provenance = path.join(destination, 'PROVENANCE.json');
  const manifest = JSON.parse(await readFile(provenance, 'utf8'));
  manifest.files.find(file => file.path === 'PROJECT-CONTEXT.md').sha256 = createHash('sha256').update(previous).digest('hex');
  await writeFile(provenance, JSON.stringify(manifest));
  return previous;
}
test('nested skill destinations cannot keep custom backups in an outer discovery root', {skip:!sourceAvailable}, async () => {
  await withDestination(async (_, temporary) => {
    const destination = path.join(temporary, 'skills', 'vendor', 'skills', 'matt-pocock');
    assert.equal(run(destination, '--apply').status, 0);
    const previous = await markPreviousGeneration(destination);
    const result = run(destination, '--backup-root', path.join(temporary, 'skills', 'backups'), '--apply');
    assert.notEqual(result.status, 0, 'Backups must not introduce stale skills into an outer discovery root');
    assert.equal(await readFile(path.join(destination, 'PROJECT-CONTEXT.md'), 'utf8'), previous);
  });
});
test('nested skill destinations put default backups outside every enclosing skills root', {skip:!sourceAvailable}, async () => {
  await withDestination(async (_, temporary) => {
    const destination = path.join(temporary, 'skills', 'vendor', 'skills', 'matt-pocock');
    assert.equal(run(destination, '--apply').status, 0);
    const previous = await markPreviousGeneration(destination);
    const result = run(destination, '--apply');
    assert.equal(result.status, 0, result.stderr);
    const backup = JSON.parse(result.stdout).backup;
    assert.equal(await realpath(path.dirname(backup)), path.join(await realpath(temporary), '.pi-config-state', 'backups'));
    assert.equal(await readFile(path.join(backup, 'PROJECT-CONTEXT.md'), 'utf8'), previous);
  });
});
test('custom backups cannot move stale skills into another standard discovery root', {skip:!sourceAvailable}, async () => {
  await withDestination(async (destination, temporary) => {
    assert.equal(run(destination, '--apply').status, 0);
    const previous = await markPreviousGeneration(destination);
    const result = run(destination, '--backup-root', path.join(temporary, '.pi', 'agent', 'skills', 'backups'), '--apply');
    assert.notEqual(result.status, 0, 'The other Pi discovery root must not receive the old collection');
    assert.equal(await readFile(path.join(destination, 'PROJECT-CONTEXT.md'), 'utf8'), previous);
  });
});
test('unmanaged destination is never overwritten', {skip:!sourceAvailable}, async () => {
  await withDestination(async destination => {
    await mkdir(destination,{recursive:true});
    await writeFile(path.join(destination,'SKILL.md'),'keep me');
    const result = run(destination,'--apply');
    assert.notEqual(result.status,0);
    assert.equal(await readFile(path.join(destination,'SKILL.md'),'utf8'),'keep me');
  });
});
