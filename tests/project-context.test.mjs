import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolveProject } from '../scripts/project-context.mjs';

const script = fileURLToPath(new URL('../scripts/project-context.mjs', import.meta.url));
const gitEnvironment = {
  ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_'))),
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_CONFIG_GLOBAL: process.platform === 'win32' ? 'NUL' : '/dev/null',
  GIT_TERMINAL_PROMPT: '0',
};

function git(cwd, ...args) {
  const result = spawnSync('git', ['-C', cwd, ...args], {
    env: gitEnvironment, encoding: 'utf8', timeout: 10_000, windowsHide: true,
  });
  assert.equal(result.status, 0, result.stderr || result.error?.message);
  return result.stdout.trim();
}

function fixture(t, { repository = true } = {}) {
  const base = realpathSync.native(mkdtempSync(path.join(tmpdir(), 'project-context-')));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const cwd = path.join(base, 'checkout');
  const agentsDir = path.join(base, 'home', '.pi', 'agent');
  mkdirSync(cwd, { recursive: true });
  if (repository) git(cwd, '-c', 'init.defaultBranch=main', 'init');
  return { base, cwd, agentsDir };
}

function settings(overrides = {}) {
  return {
    schemaVersion: 1,
    defaultProfile: 'personal',
    profiles: {
      personal: { tracker: { kind: 'local' }, instructions: ['private/common.md'] },
      work: {
        extends: 'personal',
        tracker: { kind: 'gitlab', host: 'https://code.example', namespace: 'group' },
        instructions: ['private/work.md'],
      },
    },
    rules: [],
    projects: {},
    ...overrides,
  };
}

function snapshot(root) {
  const entries = [];
  function visit(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const filename = path.join(directory, entry.name);
      const relative = path.relative(root, filename);
      if (entry.isDirectory()) {
        entries.push([relative, 'directory']);
        visit(filename);
      } else {
        entries.push([relative, createHash('sha256').update(readFileSync(filename)).digest('hex')]);
      }
    }
  }
  visit(root);
  return entries;
}

test('a normal dirty repository gets external local notes without writing any files', async (t) => {
  const { base, cwd, agentsDir } = fixture(t);
  writeFileSync(path.join(cwd, 'tracked.txt'), 'original\n');
  git(cwd, 'add', 'tracked.txt');
  writeFileSync(path.join(cwd, 'tracked.txt'), 'dirty\n');
  mkdirSync(path.join(cwd, 'nested'));
  const before = snapshot(base);

  const result = await resolveProject({ cwd: path.join(cwd, 'nested'), agentsDir });

  assert.equal(result.root, cwd);
  assert.equal(result.profile, 'personal');
  assert.equal(result.repository, null);
  assert.match(result.projectId, /^project-[a-f0-9]{24}$/);
  const project = path.join(agentsDir, 'projects', result.projectId);
  assert.deepEqual(result.paths, {
    project,
    artifacts: path.join(project, 'artifacts'),
    glossary: path.join(project, 'GLOSSARY.md'),
    adrs: path.join(project, 'adr'),
  });
  assert.deepEqual(result.tracker, { kind: 'local', root: result.paths.artifacts });
  assert.deepEqual(result.instructions, []);
  assert.deepEqual(snapshot(base), before);
});

test('clones and HTTPS/SSH origins share a sanitized stable identity', async (t) => {
  const { base, cwd, agentsDir } = fixture(t);
  const clone = path.join(base, 'clone');
  git(base, 'clone', '--local', cwd, clone);
  git(cwd, 'remote', 'add', 'origin', 'https://private-user:private-password@CODE.EXAMPLE/group/repo.git?private-token=yes#secret');
  git(clone, 'remote', 'set-url', 'origin', 'git@code.example:group/repo.git');
  const before = snapshot(base);
  const first = await resolveProject({ cwd, agentsDir });
  const second = await resolveProject({ cwd: clone, agentsDir });
  assert.deepEqual(snapshot(base), before);
  assert.equal(first.repository, 'code.example/group/repo');
  assert.equal(second.repository, first.repository);
  assert.equal(first.projectId, second.projectId);
  assert.deepEqual(first.paths, second.paths);
  assert.doesNotMatch(JSON.stringify(first), /private-user|private-password|private-token|secret/);

  git(clone, 'remote', 'set-url', 'origin', 'ssh://git@code.example:22/group/repo.git');
  assert.equal((await resolveProject({ cwd: clone, agentsDir })).projectId, first.projectId);
});

test('linked worktrees protect the primary checkout when Git metadata is separate', async (t) => {
  const { base, cwd, agentsDir } = fixture(t, { repository: false });
  git(cwd, 'init', '--separate-git-dir', path.join(base, 'metadata'));
  git(cwd, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--allow-empty', '-m', 'fixture');
  const linked = path.join(base, 'linked');
  git(cwd, 'worktree', 'add', '--detach', linked);
  assert.equal((await resolveProject({ cwd, agentsDir })).projectId, (await resolveProject({ cwd: linked, agentsDir })).projectId);
  await assert.rejects(async () => resolveProject({ cwd: linked, agentsDir: path.join(cwd, 'private-agent') }), /outside.*repository/i);
  const instructions = path.join(cwd, 'private-policy.md');
  writeFileSync(instructions, 'Synthetic private instructions.\n');
  await assert.rejects(async () => resolveProject({ cwd: linked, agentsDir, config: settings({ profiles: { personal: { tracker: { kind: 'local' }, instructions: [instructions] } } }) }), /outside.*repository/i);
});

test('linked worktrees without an origin share the common Git directory identity', async (t) => {
  const { base, cwd, agentsDir } = fixture(t);
  // Commits exist only in disposable fixtures, never in the source repository.
  git(cwd, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--allow-empty', '-m', 'fixture');
  const linked = path.join(base, 'linked');
  git(cwd, 'worktree', 'add', '--detach', linked);
  const first = await resolveProject({ cwd, agentsDir });
  const second = await resolveProject({ cwd: linked, agentsDir });
  assert.equal(first.repository, null);
  assert.equal(second.projectId, first.projectId);
  assert.equal(second.root, linked);
  await assert.rejects(async () => resolveProject({ cwd: linked, agentsDir: path.join(cwd, 'private') }), /outside.*repository/i);
  git(cwd, 'remote', 'add', 'origin', 'ssh://git@code.example/group/linked.git');
  assert.equal((await resolveProject({ cwd, agentsDir })).projectId, (await resolveProject({ cwd: linked, agentsDir })).projectId);
  const other = path.join(base, 'unrelated');
  mkdirSync(other);
  git(other, 'init');
  assert.notEqual((await resolveProject({ cwd: other, agentsDir })).projectId, first.projectId);
});

test('shared work settings inherit private instructions with a personal GitHub exception', async (t) => {
  const { cwd, agentsDir } = fixture(t);
  const config = settings({ rules: [
    { profile: 'work', root: cwd },
    { profile: 'work', remotePrefix: 'code.example/group' },
    { profile: 'personal', remotePrefix: 'github.com/my-account' },
  ] });
  git(cwd, 'remote', 'add', 'origin', 'git@code.example:group/app.git');
  const work = await resolveProject({ cwd, agentsDir, config });
  assert.equal(work.profile, 'work');
  assert.deepEqual(work.tracker, { kind: 'gitlab', host: 'https://code.example', namespace: 'group' });
  assert.deepEqual(work.instructions, [path.join(agentsDir, 'private/common.md'), path.join(agentsDir, 'private/work.md')]);
  git(cwd, 'remote', 'set-url', 'origin', 'git@github.com:my-account/weekend.git');
  const personal = await resolveProject({ cwd, agentsDir, config });
  assert.equal(personal.profile, 'personal');
  assert.deepEqual(personal.tracker, { kind: 'local', root: personal.paths.artifacts });
});

test('the shipped work example scopes corporate context positively rather than by machine alone', async (t) => {
  const { cwd, agentsDir } = fixture(t);
  const config = JSON.parse(readFileSync(new URL('../profiles/work.projects.example.json', import.meta.url), 'utf8'));
  config.profiles.work.instructions = ['private/corporate-bootstrap.md'];
  const cases = [
    { name: 'new repository without an origin', remote: null, profile: 'personal' },
    { name: 'personal GitHub account not prelisted', remote: 'https://github.com/a-personal-account/new-repo.git', profile: 'personal' },
    { name: 'explicit corporate namespace', remote: 'https://gitlab.corporate.example/your-group/service.git', profile: 'work' },
    { name: 'other GitLab namespace', remote: 'https://gitlab.corporate.example/another-group/tool.git', profile: 'personal' },
    { name: 'lookalike corporate host', remote: 'https://gitlab.corporate.example.evil/your-group/service.git', profile: 'personal' },
  ];
  let originExists = false;
  for (const sample of cases) {
    await t.test(sample.name, () => {
      if (sample.remote) {
        git(cwd, 'remote', originExists ? 'set-url' : 'add', 'origin', sample.remote);
        originExists = true;
      }
      const result = resolveProject({ cwd, agentsDir, config });
      assert.equal(result.profile, sample.profile);
      assert.deepEqual(result.instructions, sample.profile === 'work' ? [path.join(agentsDir, 'private/corporate-bootstrap.md')] : []);
      assert.equal(result.tracker.kind, sample.profile === 'work' ? 'gitlab' : 'local');
    });
  }
});

test('an explicit project profile and tracker override win over all rules', async (t) => {
  const { cwd, agentsDir } = fixture(t);
  git(cwd, 'remote', 'add', 'origin', 'https://code.example/group/app.git');
  const { projectId } = await resolveProject({ cwd, agentsDir });
  const config = settings({
    rules: [{ profile: 'work', remotePrefix: 'code.example/group' }],
    projects: { [projectId]: { profile: 'personal', tracker: { kind: 'local', root: 'ignored' }, instructions: ['private/app.md'] } },
  });
  const before = structuredClone(config);
  const result = await resolveProject({ cwd, agentsDir, config });
  assert.equal(result.profile, 'personal');
  assert.deepEqual(result.tracker, { kind: 'local', root: result.paths.artifacts });
  assert.deepEqual(result.instructions, [path.join(agentsDir, 'private/common.md'), path.join(agentsDir, 'private/app.md')]);
  assert.deepEqual(config, before);
});

test('same-kind tracker overrides inherit shared fields without mutating the profile', async (t) => {
  const { cwd, agentsDir } = fixture(t);
  const { projectId } = await resolveProject({ cwd, agentsDir });
  const config = settings({ defaultProfile: 'work', projects: { [projectId]: { tracker: { project: 'group/app' } } } });
  const result = await resolveProject({ cwd, agentsDir, config });
  assert.deepEqual(result.tracker, { kind: 'gitlab', host: 'https://code.example', namespace: 'group', project: 'group/app' });
  assert.equal(config.profiles.work.tracker.project, undefined);
});

test('default settings are read externally, and an explicit config takes precedence', async (t) => {
  const { base, cwd, agentsDir } = fixture(t);
  mkdirSync(agentsDir, { recursive: true });
  writeFileSync(path.join(agentsDir, 'projects.json'), JSON.stringify(settings({ defaultProfile: 'work' })));
  const before = snapshot(base);
  assert.equal((await resolveProject({ cwd, agentsDir })).profile, 'work');
  assert.equal((await resolveProject({ cwd, agentsDir, config: settings() })).profile, 'personal');
  assert.deepEqual(snapshot(base), before);
});

test('remote rules use longest boundary prefixes, not lookalike hosts or groups', async (t) => {
  const { cwd, agentsDir } = fixture(t);
  const config = settings({ rules: [
    { profile: 'work', remotePrefix: 'CODE.EXAMPLE/group/' },
    { profile: 'personal', remotePrefix: 'code.example/group/weekend' },
  ] });
  git(cwd, 'remote', 'add', 'origin', 'https://code.example/group/app.git');
  assert.equal((await resolveProject({ cwd, agentsDir, config })).profile, 'work');
  for (const remote of ['https://code.example/group/weekend/app.git', 'https://code.example/group-two/app.git', 'https://code.example.evil/group/app.git']) {
    git(cwd, 'remote', 'set-url', 'origin', remote);
    assert.equal((await resolveProject({ cwd, agentsDir, config })).profile, 'personal');
  }
});

test('root rules use longest directory boundary prefixes', async (t) => {
  const { base, cwd, agentsDir } = fixture(t);
  const config = settings({ rules: [
    { profile: 'work', root: base },
    { profile: 'personal', root: cwd },
    { profile: 'personal', root: `${base}-lookalike` },
  ] });
  assert.equal((await resolveProject({ cwd, agentsDir, config })).profile, 'personal');
  config.rules.pop();
  config.rules.pop();
  assert.equal((await resolveProject({ cwd, agentsDir, config })).profile, 'work');
  config.rules[0].root = `${cwd}-lookalike`;
  assert.equal((await resolveProject({ cwd, agentsDir, config })).profile, 'personal');
});

test('conflicting same-specificity rules fail clearly while identical-profile duplicates are allowed', async (t) => {
  const { cwd, agentsDir } = fixture(t);
  git(cwd, 'remote', 'add', 'origin', 'https://code.example/group/app.git');
  for (const rules of [
    [{ profile: 'work', remotePrefix: 'code.example/group' }, { profile: 'personal', remotePrefix: 'CODE.EXAMPLE/group/' }],
    [{ profile: 'work', root: cwd }, { profile: 'personal', root: path.join(cwd, '.') }],
  ]) {
    await assert.rejects(async () => resolveProject({ cwd, agentsDir, config: settings({ rules }) }), /ambiguous|conflicting/i);
    rules[1].profile = 'work';
    assert.equal((await resolveProject({ cwd, agentsDir, config: settings({ rules }) })).profile, 'work');
  }
});

test('configured GitHub and other service trackers inherit without leaking fields across kinds', async (t) => {
  const { cwd, agentsDir } = fixture(t);
  const { projectId } = await resolveProject({ cwd, agentsDir });
  const config = settings({ defaultProfile: 'work', profiles: {
    personal: { tracker: { kind: 'github', repository: 'example/project' } },
    work: { extends: 'personal', tracker: { kind: 'jira', host: 'https://issues.example', project: 'DEMO' } },
  } });
  assert.deepEqual((await resolveProject({ cwd, agentsDir, config })).tracker,
    { kind: 'jira', host: 'https://issues.example', project: 'DEMO' });
  config.projects[projectId] = { profile: 'personal' };
  assert.deepEqual((await resolveProject({ cwd, agentsDir, config })).tracker,
    { kind: 'github', repository: 'example/project' });
  config.projects[projectId].tracker = { kind: 'custom-service', project: 'synthetic' };
  assert.deepEqual((await resolveProject({ cwd, agentsDir, config })).tracker,
    { kind: 'custom-service', project: 'synthetic' });
});
test('invalid tracker service identifiers fail without echoing their raw contents', async (t) => {
  const { cwd, agentsDir } = fixture(t);
  for (const kind of ['', null, 42, 'Invalid Kind', 'secret/credential', 'a'.repeat(65)]) {
    const config = settings({ profiles: { personal: { tracker: { kind } } } });
    await assert.rejects(async () => resolveProject({ cwd, agentsDir, config }), error => {
      assert.match(error.message, /Invalid project config:/);
      if (typeof kind === 'string' && kind.length > 3) assert.ok(!error.message.includes(kind));
      return true;
    });
  }
});
test('malformed settings and unknown references are rejected even when they would not match', async (t) => {
  const { cwd, agentsDir } = fixture(t);
  const invalid = [
    null,
    [],
    settings({ schemaVersion: 2 }),
    settings({ defaultProfile: 'missing' }),
    settings({ typo: true }),
    settings({ profiles: [] }),
    settings({ profiles: { personal: { tracker: { kind: 'invalid kind' } } } }),
    settings({ profiles: { personal: { tracker: { kind: 'local' }, typo: true } } }),
    settings({ profiles: { personal: { extends: 'missing' } } }),
    settings({ profiles: { personal: { extends: 'work' }, work: { extends: 'personal' } } }),
    settings({ profiles: { personal: { instructions: 'not-an-array', tracker: { kind: 'local' } } } }),
    settings({ rules: {} }),
    settings({ rules: [{ profile: 'missing', remotePrefix: 'other.example/group' }] }),
    settings({ rules: [{ profile: 'work' }] }),
    settings({ rules: [{ profile: 'work', remotePrefix: 'code.example/group', root: cwd }] }),
    settings({ rules: [{ profile: 'work', remotePrefix: 'https://user:secret@code.example/group?token=secret' }] }),
    settings({ rules: [{ profile: 'work', root: 42 }] }),
    settings({ projects: [] }),
    settings({ projects: { unrelated: { profile: 'missing' } } }),
    settings({ projects: { unrelated: { tracker: 'local' } } }),
  ];
  for (const config of invalid) {
    await assert.rejects(async () => resolveProject({ cwd, agentsDir, config }), /Invalid project config:/);
  }
  mkdirSync(agentsDir, { recursive: true });
  writeFileSync(path.join(agentsDir, 'projects.json'), '{not valid JSON: secret}');
  await assert.rejects(async () => resolveProject({ cwd, agentsDir }), /Invalid project config:.*valid JSON/);
});

test('notes cannot be located inside a repository, including symlink and dangling-symlink ancestors', async (t) => {
  const { base, cwd, agentsDir } = fixture(t);
  for (const inside of [cwd, path.join(cwd, 'private', 'agent')]) {
    await assert.rejects(async () => resolveProject({ cwd, agentsDir: inside }), /outside.*repository/i);
  }
  const alias = path.join(base, 'aliased-project');
  symlinkSync(cwd, alias, process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(async () => resolveProject({ cwd, agentsDir: path.join(alias, 'not-created') }), /outside.*repository/i);
  const dangling = path.join(base, 'dangling');
  symlinkSync(path.join(cwd, 'not-created'), dangling, process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(async () => resolveProject({ cwd, agentsDir: path.join(dangling, 'agent') }), /outside.*repository/i);

  mkdirSync(agentsDir, { recursive: true });
  symlinkSync(cwd, path.join(agentsDir, 'projects'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(async () => resolveProject({ cwd, agentsDir }), /outside.*repository/i);
});

test('existing per-project symlinks and private instructions cannot redirect notes into the repository', async (t) => {
  const { cwd, agentsDir } = fixture(t);
  const first = await resolveProject({ cwd, agentsDir });
  mkdirSync(first.paths.project, { recursive: true });
  symlinkSync(cwd, first.paths.artifacts, process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(async () => resolveProject({ cwd, agentsDir }), /outside.*repository/i);
  rmSync(first.paths.artifacts);
  const config = settings();
  config.profiles.personal.instructions = [path.join(cwd, 'PRIVATE.md')];
  await assert.rejects(async () => resolveProject({ cwd, agentsDir, config }), /outside.*repository/i);
});

test('private instruction paths are absolute, inherited, deduplicated, and only expand a known agents home', async (t) => {
  const { base, cwd, agentsDir } = fixture(t);
  const config = settings({ defaultProfile: 'work' });
  config.profiles.personal.instructions = ['~/notes/common.md'];
  config.profiles.work.instructions = ['~/notes/common.md', 'private/work.md'];
  const result = await resolveProject({ cwd, agentsDir, config });
  assert.deepEqual(result.instructions, [path.join(base, 'home', 'notes', 'common.md'), path.join(agentsDir, 'private', 'work.md')]);
  await assert.rejects(async () => resolveProject({ cwd, agentsDir: path.join(base, 'nonstandard'), config }), /home.*undefined|home.*well-defined/i);
});

function cli(args, env = process.env) {
  return spawnSync(process.execPath, [script, ...args], {
    env, encoding: 'utf8', timeout: 15_000, windowsHide: true,
  });
}

function withoutGit() {
  return { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => key.toUpperCase() !== 'PATH')), PATH: '' };
}

test('the CLI prints the same JSON as the API, accepts inline JSON, and importing has no side effects', async (t) => {
  const { base, cwd, agentsDir } = fixture(t);
  const config = settings({ defaultProfile: 'work' });
  const before = snapshot(base);
  const result = cli(['--cwd', cwd, '--agents-dir', agentsDir, '--config', JSON.stringify(config)]);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), await resolveProject({ cwd, agentsDir, config }));
  assert.equal(result.stderr, '');
  const imported = spawnSync(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(new URL('../scripts/project-context.mjs', import.meta.url).href)}); console.log('imported');`], { encoding: 'utf8', timeout: 10_000 });
  assert.equal(imported.status, 0, imported.stderr);
  assert.equal(imported.stdout.trim(), 'imported');
  assert.deepEqual(snapshot(base), before);
});

test('CLI errors are clear, nonzero, and never echo malformed secret input', (t) => {
  const { cwd, agentsDir } = fixture(t);
  for (const args of [
    [],
    ['--cwd', cwd, '--agents-dir', agentsDir, '--config', '{private-token:secret}'],
    ['--cwd', cwd, '--agents-dir', agentsDir, '--unknown'],
    ['--cwd', cwd, '--cwd', cwd, '--agents-dir', agentsDir],
    ['--cwd', cwd, '--agents-dir', agentsDir, 'toString', 'value'],
  ]) {
    const result = cli(args);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /project-context:/);
    assert.doesNotMatch(result.stderr, /private-token|secret|at .*\.mjs:/);
  }
});

test('without Git the CLI falls back to a canonical cwd identity safely', async (t) => {
  const { base, cwd, agentsDir } = fixture(t, { repository: false });
  const alias = path.join(base, 'alias');
  symlinkSync(cwd, alias, process.platform === 'win32' ? 'junction' : 'dir');
  const before = readdirSync(base);
  const result = cli(['--cwd', alias, '--agents-dir', agentsDir], withoutGit());
  assert.equal(result.status, 0, result.stderr);
  const resolved = JSON.parse(result.stdout);
  assert.equal(resolved.repository, null);
  assert.equal(resolved.root, cwd);
  assert.deepEqual(resolved, await resolveProject({ cwd, agentsDir }));
  assert.deepEqual(readdirSync(base), before);
});

test('eighty projects reuse a single personal policy without per-project files or config entries', (t) => {
  const { base, cwd, agentsDir } = fixture(t, { repository: false });
  const checkouts = Array.from({ length: 80 }, (_, index) => path.join(cwd, `project-${index}`));
  for (const checkout of checkouts) mkdirSync(checkout);
  const config = settings({ defaultProfile: 'work', rules: [{ profile: 'personal', root: cwd }] });
  const before = snapshot(base);
  const source = `
    import { resolveProject } from ${JSON.stringify(new URL('../scripts/project-context.mjs', import.meta.url).href)};
    const config = ${JSON.stringify(config)};
    const results = ${JSON.stringify(checkouts)}.map(cwd => resolveProject({ cwd, agentsDir: ${JSON.stringify(agentsDir)}, config }));
    console.log(JSON.stringify({ ids: results.map(result => result.projectId), profiles: results.map(result => result.profile), entries: Object.keys(config.projects) }));
  `;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', source], { env: withoutGit(), encoding: 'utf8', timeout: 20_000 });
  assert.equal(result.status, 0, result.stderr);
  const resolved = JSON.parse(result.stdout);
  assert.equal(new Set(resolved.ids).size, 80);
  assert.deepEqual(new Set(resolved.profiles), new Set(['personal']));
  assert.deepEqual(resolved.entries, []);
  assert.deepEqual(snapshot(base), before);
});

test('local path and file URL origins share an identity across real local clones', async (t) => {
  const { base, cwd, agentsDir } = fixture(t);
  const clone = path.join(base, 'clone');
  const another = path.join(base, 'another');
  git(base, 'clone', '--local', cwd, clone);
  git(base, 'clone', '--local', cwd, another);
  git(another, 'remote', 'set-url', 'origin', pathToFileURL(cwd).href);
  const first = await resolveProject({ cwd: clone, agentsDir });
  const second = await resolveProject({ cwd: another, agentsDir });
  assert.equal(first.repository, pathToFileURL(cwd).href);
  assert.equal(second.projectId, first.projectId);
});

test('Git-unavailable safety still recognizes repository ancestors from a nested cwd', (t) => {
  const { cwd } = fixture(t);
  const nested = path.join(cwd, 'nested');
  mkdirSync(nested);
  const result = cli(['--cwd', nested, '--agents-dir', path.join(cwd, 'private')], withoutGit());
  assert.equal(result.status, 1);
  assert.match(result.stderr, /outside.*repository/i);
});

test('malformed SCP credentials are not exposed as a repository path', async (t) => {
  const { cwd, agentsDir } = fixture(t);
  git(cwd, 'remote', 'add', 'origin', 'private-user:private-password@code.example:group/repo.git?private-token=yes');
  const result = await resolveProject({ cwd, agentsDir });
  assert.equal(result.repository, null);
  assert.doesNotMatch(JSON.stringify(result), /private-user|private-password|private-token/);
});

test('inherited Git environment variables cannot redirect repository discovery', async (t) => {
  const { cwd, agentsDir } = fixture(t);
  git(cwd, 'remote', 'add', 'origin', 'https://code.example/group/app.git');
  const expected = await resolveProject({ cwd, agentsDir });
  const result = cli(['--cwd', cwd, '--agents-dir', agentsDir], {
    ...process.env,
    GIT_DIR: path.join(cwd, 'missing'),
    GIT_WORK_TREE: agentsDir,
    GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_KEY_0: 'remote.origin.url',
    GIT_CONFIG_VALUE_0: 'https://private-user:private-password@evil.example/wrong.git',
  });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), expected);
});
