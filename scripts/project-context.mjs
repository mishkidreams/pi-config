/**
 * Read-only personal project context resolver (Node.js 24, no dependencies).
 *
 * resolveProject({cwd, agentsDir, config?}) is synchronous. Importing this module
 * does not run its CLI. CLI: node scripts/project-context.mjs --cwd <directory>
 * [--agents-dir <directory>] [--config <inline-JSON-object>]. The CLI defaults
 * agentsDir to PI_CODING_AGENT_DIR or ~/.pi/agent. Errors exit 1;
 * success prints one JSON object. Nothing is created, fetched, or mutated.
 *
 * Settings: explicit config replaces <agentsDir>/projects.json. If that file is
 * absent, defaults are schemaVersion 1, defaultProfile personal, and a single
 * personal profile with tracker {kind: 'local'}. Full schema example:
 * {
 *   schemaVersion: 1,
 *   defaultProfile: 'personal',
 *   profiles: {
 *     personal: {tracker: {kind: 'local'}, instructions: ['private/personal.md']},
 *     work: {extends: 'personal', tracker: {kind: 'gitlab', host: 'https://code.example'},
 *            instructions: ['private/work.md']}
 *   },
 *   rules: [{profile: 'work', remotePrefix: 'code.example/group'},
 *           {profile: 'work', root: 'C:/work'}],
 *   projects: {'<projectId>': {profile: 'personal', tracker: {kind: 'local'},
 *                            instructions: ['private/project.md']}}
 * }
 * schemaVersion, defaultProfile, and profiles are required; rules/projects and
 * entry instructions are optional. Profiles may extend one named profile;
 * cycles and unknown references are invalid, including in unused entries.
 * Tracker fields are inert JSON data, not network clients. Kinds are lowercase
 * service identifiers (for example local, github, gitlab, jira). Same-kind trackers shallow-merge; changing kind replaces prior
 * fields. A tracker without kind inherits it. Profiles must eventually define
 * kind. local.root is always derived from paths.artifacts, ignoring overrides.
 * Unknown non-tracker fields are errors, to catch misspelled settings.
 *
 * Profile precedence: explicit project.profile > remote-prefix rule > root
 * rule > defaultProfile. Rules have exactly one selector. Remote selectors are
 * credential-free host/path strings; root selectors are absolute paths or
 * agentsDir-relative paths, matched against the repository root. Longest
 * segment-boundary prefix wins within a category; conflicting profiles tied
 * at the winning specificity fail (same-profile duplicates are harmless).
 * Project tracker fields override the selected shared profile's tracker.
 * Instructions accumulate parent-first, then profile, then project, and are
 * deduplicated absolute paths, never document contents. Relative paths use
 * agentsDir. ~/ expands only when canonical agentsDir is <home>/.pi/agent;
 * otherwise use absolute/agentsDir-relative paths. ~other is not supported.
 *
 * Result: {projectId, profile, repository, root, tracker, paths, instructions}.
 * paths is {project, artifacts, glossary, adrs}, respectively
 * <agentsDir>/projects/<projectId>, its artifacts/, GLOSSARY.md, and adr/.
 * projectId is project- plus the first 24 SHA-256 hex digits of a namespaced
 * identity: sanitized origin, else canonical common Git directory, else
 * canonical cwd. Remote origins unify SSH/SCP/HTTPS, lowercase hosts, normalize
 * path separators/dot segments, and remove .git, userinfo, query, and fragment.
 * Path case is preserved for case-sensitive servers; nondefault ports remain.
 * Local/file origins use canonical file URLs. Without Git, identity falls back
 * to cwd while .git ancestor markers still protect the working repository.
 * repository is the sanitized origin or null; root is the canonical checkout
 * root (or cwd outside Git). Notes/private instructions must be outside the
 * checkout and common Git metadata/primary checkout, including symlink and
 * nonexistent-path ancestors. Checks describe the filesystem at resolve time.
 * Git reads are bounded (2 seconds/64 KiB each), disable optional locks, ignore
 * inherited GIT_* redirects, and only query rev-parse/config; never status.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, readlinkSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

function canonicalPath(value, links = 0) {
  if (links > 40) throw new Error('Cannot canonicalize a cyclic symlink path');
  let current = path.resolve(value);
  const missing = [];
  for (;;) {
    try {
      return path.join(realpathSync.native(current), ...missing);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      try {
        if (lstatSync(current).isSymbolicLink()) {
          const target = path.resolve(path.dirname(current), readlinkSync(current));
          return path.join(canonicalPath(target, links + 1), ...missing);
        }
      } catch (linkError) {
        if (linkError.code !== 'ENOENT') throw linkError;
      }
      const parent = path.dirname(current);
      if (parent === current) throw error;
      missing.unshift(path.basename(current));
      current = parent;
    }
  }
}

function gitRead(cwd, args) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^GIT_/i.test(key)));
  env.GIT_OPTIONAL_LOCKS = '0';
  env.GIT_TERMINAL_PROMPT = '0';
  const result = spawnSync('git', ['--no-optional-locks', '-C', cwd, ...args], {
    env, encoding: 'utf8', timeout: 2_000, maxBuffer: 65_536, windowsHide: true,
  });
  return result.status === 0 ? result.stdout.trim() : null;
}

function canonicalRemote(value, allowHost = false) {
  if (typeof value !== 'string' || /[\s\x00-\x1f]/.test(value)) return null;
  const clean = value.split(/[?#]/, 1)[0];
  let url;
  try {
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(clean)) {
      url = new URL(clean);
      if (!['http:', 'https:', 'ssh:', 'git:'].includes(url.protocol)) return null;
    } else {
      const scp = /^(?:[^/@:]+@)?(\[[^\]]+\]|[^/:]+):(.+)$/.exec(clean);
      if (!scp || /^[a-z]:[/\\]/i.test(clean) || scp[2].includes('@')) return null;
      url = new URL(`ssh://${scp[1]}/${scp[2]}`);
    }
    let repositoryPath = decodeURIComponent(url.pathname).replace(/\\/g, '/');
    repositoryPath = path.posix.normalize(`/${repositoryPath}`).replace(/^\/+|\/+$/g, '').replace(/\.git$/i, '');
    if ((!repositoryPath && !allowHost) || /[?#\x00-\x20]/.test(repositoryPath)) return null;
    const port = url.protocol === 'ssh:' && url.port === '22' ? '' : url.port;
    return `${url.hostname.toLowerCase()}${port ? `:${port}` : ''}${repositoryPath ? `/${repositoryPath}` : ''}`;
  } catch {
    return null;
  }
}

function canonicalOrigin(value, root) {
  if (typeof value !== 'string' || !value || /[\x00-\x1f]/.test(value)) return null;
  const clean = value.split(/[?#]/, 1)[0];
  try {
    if (clean.startsWith('file://')) return pathToFileURL(canonicalPath(fileURLToPath(clean))).href;
    if (/^[a-z]:[/\\]/i.test(clean) || (!clean.includes(':') && !clean.includes('@'))) {
      return pathToFileURL(canonicalPath(path.resolve(root, clean))).href;
    }
    return canonicalRemote(value);
  } catch {
    return null;
  }
}

function repositoryAncestor(cwd) {
  for (let directory = cwd; ; directory = path.dirname(directory)) {
    try {
      const marker = lstatSync(path.join(directory, '.git'));
      if (marker.isDirectory() || marker.isFile() || marker.isSymbolicLink()) return directory;
    } catch (error) {
      if (!['ENOENT', 'ENOTDIR'].includes(error.code)) throw error;
    }
    if (path.dirname(directory) === directory) return null;
  }
}

function invalid(message) {
  throw new Error(`Invalid project config: ${message}`);
}

function loadConfig(agentsDir, supplied) {
  if (supplied !== undefined) return supplied;
  let contents;
  try {
    contents = readFileSync(path.join(agentsDir, 'projects.json'), 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') throw new Error('Cannot read project settings');
    return { schemaVersion: 1, defaultProfile: 'personal', profiles: { personal: { tracker: { kind: 'local' } } } };
  }
  try {
    return JSON.parse(contents);
  } catch {
    invalid('projects.json must contain valid JSON');
  }
}

function record(value, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) invalid(`${label} must be an object`);
}

function textValue(value, label) {
  if (typeof value !== 'string' || !value.trim() || value.includes('\0')) invalid(`${label} must be a nonempty string`);
}

function fields(value, allowed, label) {
  record(value, label);
  if (Object.keys(value).some((key) => !allowed.includes(key))) invalid(`${label} contains unknown fields`);
}

function jsonValue(value, ancestors = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number' && Number.isFinite(value)) return;
  if (typeof value !== 'object' || ancestors.has(value)) invalid('tracker fields must be JSON values');
  if (!Array.isArray(value)) record(value, 'tracker field');
  ancestors.add(value);
  for (const child of Object.values(value)) jsonValue(child, ancestors);
  ancestors.delete(value);
}

function trackerKind(value) {
  return typeof value === 'string' && /^[a-z][a-z0-9-]{0,63}$/.test(value);
}

function validateEntry(entry, profileEntry = false) {
  fields(entry, profileEntry ? ['extends', 'tracker', 'instructions'] : ['profile', 'tracker', 'instructions'], 'profile/project');
  if (Object.hasOwn(entry, 'extends')) textValue(entry.extends, 'extends');
  if (Object.hasOwn(entry, 'profile')) textValue(entry.profile, 'profile');
  if (Object.hasOwn(entry, 'tracker')) {
    record(entry.tracker, 'tracker');
    jsonValue(entry.tracker);
    if (Object.hasOwn(entry.tracker, 'kind') && !trackerKind(entry.tracker.kind)) invalid('tracker.kind must be a lowercase service identifier');
  }
  if (Object.hasOwn(entry, 'instructions')) {
    if (!Array.isArray(entry.instructions)) invalid('instructions must be an array');
    for (const filename of entry.instructions) textValue(filename, 'instruction path');
  }
}

function validateConfig(config) {
  fields(config, ['schemaVersion', 'defaultProfile', 'profiles', 'rules', 'projects'], 'settings');
  if (config.schemaVersion !== 1) invalid('schemaVersion must be 1');
  textValue(config.defaultProfile, 'defaultProfile');
  record(config.profiles, 'profiles');
  const known = (name) => {
    if (!Object.hasOwn(config.profiles, name)) invalid('unknown profile reference');
  };
  known(config.defaultProfile);
  for (const [name, entry] of Object.entries(config.profiles)) {
    textValue(name, 'profile name');
    validateEntry(entry, true);
    if (entry.extends) known(entry.extends);
  }
  for (const name of Object.keys(config.profiles)) {
    if (!trackerKind(inheritedProfile(config, name).tracker.kind)) invalid('each profile must inherit or define tracker.kind');
  }
  if (Object.hasOwn(config, 'rules') && !Array.isArray(config.rules)) invalid('rules must be an array');
  for (const rule of config.rules || []) {
    fields(rule, ['profile', 'remotePrefix', 'root'], 'rule');
    textValue(rule.profile, 'rule profile');
    known(rule.profile);
    if (Object.hasOwn(rule, 'remotePrefix') === Object.hasOwn(rule, 'root')) invalid('each rule needs exactly one remotePrefix or root');
    if (Object.hasOwn(rule, 'remotePrefix')) {
      textValue(rule.remotePrefix, 'remotePrefix');
      if (/[\s@?#\\]/.test(rule.remotePrefix) || rule.remotePrefix.includes('://')
        || !canonicalRemote(`https://${rule.remotePrefix}`, true)) invalid('remotePrefix must be a credential-free host/path');
    } else {
      textValue(rule.root, 'rule root');
    }
  }
  if (Object.hasOwn(config, 'projects')) record(config.projects, 'projects');
  for (const [id, entry] of Object.entries(config.projects || {})) {
    textValue(id, 'project ID');
    validateEntry(entry);
    if (entry.profile) known(entry.profile);
  }
}

function mergeTracker(base, override) {
  if (!override) return { ...base };
  return structuredClone({ ...(override.kind && override.kind !== base?.kind ? {} : base), ...override });
}

function inheritedProfile(config, name, visiting = new Set()) {
  if (!config.profiles || !Object.hasOwn(config.profiles, name)) invalid('unknown profile');
  if (visiting.has(name)) invalid('profile inheritance cycle');
  visiting.add(name);
  const own = config.profiles[name];
  const parent = own.extends ? inheritedProfile(config, own.extends, visiting) : {};
  visiting.delete(name);
  return {
    tracker: mergeTracker(parent.tracker, own.tracker),
    instructions: [...(parent.instructions || []), ...(own.instructions || [])],
  };
}

function within(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

function matchingProfile(rules, repository, root, agentsDir, remote) {
  const matches = [];
  for (const rule of rules) {
    let prefix;
    if (remote) {
      if (!rule.remotePrefix || !repository) continue;
      prefix = canonicalRemote(`https://${rule.remotePrefix}`, true);
      if (!prefix || !(repository === prefix || repository.startsWith(`${prefix}/`))) continue;
    } else {
      if (!rule.root) continue;
      prefix = canonicalPath(path.resolve(agentsDir, rule.root));
      if (!within(prefix, root)) continue;
    }
    matches.push({ profile: rule.profile, specificity: prefix.length });
  }
  if (!matches.length) return undefined;
  const longest = Math.max(...matches.map((match) => match.specificity));
  const profiles = new Set(matches.filter((match) => match.specificity === longest).map((match) => match.profile));
  if (profiles.size > 1) invalid('ambiguous rules with conflicting profiles at the same specificity');
  return [...profiles][0];
}

function instructionPath(filename, agentsDir) {
  if (filename.startsWith('~')) {
    if (!/^~[/\\]/.test(filename) || path.basename(agentsDir) !== 'agent' || path.basename(path.dirname(agentsDir)) !== '.pi') {
      invalid('instruction home is not well-defined; use an absolute or agentsDir-relative path');
    }
    return canonicalPath(path.resolve(path.dirname(path.dirname(agentsDir)), filename.slice(2)));
  }
  return canonicalPath(path.resolve(agentsDir, filename));
}

function requireExternal(candidates, roots, common) {
  const commonPath = common ? canonicalPath(common) : null;
  const checked = new Map();
  for (const candidate of candidates) {
    const canonical = canonicalPath(candidate);
    const checkout = commonPath ? repositoryAncestor(canonical) : null;
    if (checkout && !checked.has(checkout)) {
      const related = gitRead(checkout, ['rev-parse', '--path-format=absolute', '--git-common-dir']);
      checked.set(checkout, Boolean(related) && canonicalPath(related) === commonPath);
    }
    if (roots.some((root) => within(root, candidate) || within(root, canonical)) || (checkout && checked.get(checkout))) {
      throw new Error('Project notes and private instructions must be outside the repository');
    }
  }
}

export function resolveProject({ cwd, agentsDir, config } = {}) {
  if (typeof cwd !== 'string' || !cwd || typeof agentsDir !== 'string' || !agentsDir) {
    throw new Error('cwd and agentsDir must be nonempty directory paths');
  }
  const requestedAgentsDir = path.resolve(agentsDir);
  cwd = canonicalPath(cwd);
  if (!statSync(cwd).isDirectory()) throw new Error('cwd must be a directory');
  agentsDir = canonicalPath(agentsDir);
  const root = canonicalPath(gitRead(cwd, ['rev-parse', '--show-toplevel']) || repositoryAncestor(cwd) || cwd);
  const common = gitRead(cwd, ['rev-parse', '--path-format=absolute', '--git-common-dir']);
  const repository = canonicalOrigin(common ? gitRead(cwd, ['config', '--local', '--get', 'remote.origin.url']) : null, root);
  const identity = repository ? `repository:${repository}` : common ? `git:${canonicalPath(common)}` : `directory:${cwd}`;
  const projectId = `project-${createHash('sha256').update(identity).digest('hex').slice(0, 24)}`;
  const project = path.join(agentsDir, 'projects', projectId);
  const paths = {
    project,
    artifacts: path.join(project, 'artifacts'),
    glossary: path.join(project, 'GLOSSARY.md'),
    adrs: path.join(project, 'adr'),
  };
  const protectedRoots = [root];
  if (common) {
    const commonPath = canonicalPath(common);
    protectedRoots.push(path.basename(commonPath) === '.git' ? path.dirname(commonPath) : commonPath);
  }
  requireExternal([requestedAgentsDir, agentsDir, ...Object.values(paths)], protectedRoots, common);
  config = loadConfig(agentsDir, config);
  validateConfig(config);
  const override = config.projects?.[projectId] || {};
  const profile = override.profile
    ?? matchingProfile(config.rules || [], repository, root, agentsDir, true)
    ?? matchingProfile(config.rules || [], repository, root, agentsDir, false)
    ?? config.defaultProfile;
  const inherited = inheritedProfile(config, profile);
  const tracker = mergeTracker(inherited.tracker, override.tracker);
  if (tracker.kind === 'local') tracker.root = paths.artifacts;
  const instructions = [...new Set([...inherited.instructions, ...(override.instructions || [])]
    .map((filename) => instructionPath(filename, agentsDir)))];
  requireExternal(instructions, protectedRoots, common);
  return { projectId, profile, repository, root, tracker, paths, instructions };
}

function runCli(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 2) {
    const names = new Map([['--cwd', 'cwd'], ['--agents-dir', 'agentsDir'], ['--config', 'config']]);
    const key = names.get(args[index]);
    const value = args[index + 1];
    if (!key || Object.hasOwn(options, key) || !value || value.startsWith('--')) {
      throw new Error('Usage: node scripts/project-context.mjs --cwd <dir> [--agents-dir <dir>] [--config <json>]');
    }
    options[key] = value;
  }
  if (!Object.hasOwn(options, 'agentsDir')) options.agentsDir = process.env.PI_CODING_AGENT_DIR || path.join(homedir(), '.pi', 'agent');
  if (Object.hasOwn(options, 'config')) {
    try {
      options.config = JSON.parse(options.config);
    } catch {
      invalid('--config must contain valid JSON');
    }
  }
  process.stdout.write(`${JSON.stringify(resolveProject(options), null, 2)}\n`);
}

let directInvocation = false;
try {
  directInvocation = Boolean(process.argv[1]) && realpathSync.native(process.argv[1]) === fileURLToPath(import.meta.url);
} catch {
  // An importer may supply an unrelated, nonexistent argv[1].
}
if (directInvocation) {
  try {
    runCli(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`project-context: ${error.message}\n`);
    process.exitCode = 1;
  }
}
