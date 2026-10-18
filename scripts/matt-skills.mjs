#!/usr/bin/env node
import { readFile, writeFile, readdir, mkdir, mkdtemp, rename, rm, lstat, realpath, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { withInstallLock } from './install-lock.mjs';

const configRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const digest = data => createHash('sha256').update(data).digest('hex');
const normalize = text => text.replace(/\r\n/g,'\n');
function gitBytes(cwd, args, input) {
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (/^GIT_/i.test(key)) delete env[key];
  env.GIT_TERMINAL_PROMPT = '0';
  env.GIT_OPTIONAL_LOCKS = '0';
  return execFileSync('git', ['--no-replace-objects', '-C', cwd, ...args], { env, input, stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 16 * 1024 * 1024 });
}
const git = (cwd, ...args) => gitBytes(cwd, args).toString('utf8').trim();
const safePath = value => typeof value === 'string' && value.length > 0 && !path.isAbsolute(value) && !value.split(/[\\/]/).some(p=>p==='..'||p==='.'||p==='') && !/[:\r\n\0]/.test(value);
async function pinnedFiles(sourceDir, lock) {
  const canonical = await realpath(sourceDir);
  const top = await realpath(git(sourceDir, 'rev-parse', '--show-toplevel'));
  if (path.relative(top, canonical) !== '') throw new Error('Source must be the canonical pinned checkout root');
  const entries = gitBytes(sourceDir, ['ls-tree', '-r', '-z', '--full-tree', lock.revision]).toString('utf8').split('\0').filter(Boolean).map(line => {
    const match = line.match(/^(\d+) (\w+) ([a-f0-9]+)\t([\s\S]+)$/);
    if (!match) throw new Error('Invalid pinned Git tree');
    return { mode: match[1], type: match[2], id: match[3], path: match[4] };
  });
  const prefixes = new Map();
  for (const name of lock.skills) {
    if (!/^[a-z0-9-]+$/.test(name)) throw new Error('Invalid skill selection');
    const matches = ['engineering', 'productivity'].map(group => 'skills/' + group + '/' + name + '/').filter(prefix => entries.some(entry => entry.path === prefix + 'SKILL.md'));
    if (matches.length !== 1) throw new Error('Missing or ambiguous selected skill: ' + name);
    prefixes.set(name, matches[0]);
  }
  const wanted = entries.filter(entry => entry.path === 'LICENSE' || [...prefixes.values()].some(prefix => entry.path.startsWith(prefix)));
  if (!wanted.some(entry => entry.path === 'LICENSE')) throw new Error('Pinned upstream license is missing');
  for (const entry of wanted) if (entry.type !== 'blob' || !['100644', '100755'].includes(entry.mode) || !safePath(entry.path)) throw new Error('Unsupported pinned source entry');
  const batch = gitBytes(sourceDir, ['cat-file', '--batch'], wanted.map(entry => entry.id).join('\n') + '\n');
  const files = new Map();
  let offset = 0;
  for (const entry of wanted) {
    const end = batch.indexOf(10, offset);
    if (end < 0) throw new Error('Incomplete pinned blob response');
    const match = batch.subarray(offset, end).toString('ascii').match(/^([a-f0-9]+) blob (\d+)$/);
    if (!match || match[1] !== entry.id) throw new Error('Unexpected pinned blob response');
    const size = Number(match[2]);
    offset = end + 1;
    if (!Number.isSafeInteger(size) || offset + size >= batch.length || batch[offset + size] !== 10) throw new Error('Invalid pinned blob size');
    files.set(entry.path, batch.subarray(offset, offset + size));
    offset += size + 1;
  }
  if (offset !== batch.length) throw new Error('Unexpected trailing pinned blob response');
  return { files, prefixes };
}
async function filesUnder(directory, prefix='') {
  const result = [];
  for (const entry of await readdir(directory,{withFileTypes:true})) {
    const relative = prefix ? prefix+'/'+entry.name : entry.name;
    if (entry.isSymbolicLink()) throw new Error('Symbolic links are not managed skill files: '+relative);
    if (entry.isDirectory()) result.push(...await filesUnder(path.join(directory,entry.name),relative));
    else if(entry.isFile()) result.push(relative);
    else throw new Error('Unsupported skill entry: '+relative);
  }
  return result.sort();
}
function frontmatter(text) {
  const match = normalize(text).match(/^---\n[\s\S]*?\n---\n/);
  if (!match) throw new Error('Missing skill frontmatter');
  return match[0];
}
function replaceOnce(text, oldText, newText, name) {
  if (text.split(oldText).length !== 2) throw new Error('Upstream changed; review patch: '+name);
  return text.replace(oldText,newText);
}
function nativeSkillLoading(text, filename, selected) {
  const link = name => {
    if (!selected.includes(name)) throw new Error('Unselected direct skill dependency: '+name);
    return '['+name+']('+path.posix.relative(path.posix.dirname(filename),name+'/SKILL.md')+')';
  };
  const verb = original => /^calling/i.test(original) ? 'reading' : /^calls/i.test(original) ? 'reads' : /^Call/.test(original) ? 'Read' : 'read';
  let updated=text.replace(/(Call|call) the Skill tool twice, for ["`]([a-z0-9-]+)["`] and ["`]([a-z0-9-]+)["`]/g,
    (_,original,first,second)=>verb(original)+' '+link(first)+' and '+link(second)+' with `read`');
  updated=updated.replace(/(Call|call|calls|calling) the Skill tool with ["`]([a-z0-9-]+)["`]/g,
    (_,original,name)=>verb(original)+' '+link(name)+' with `read`');
  updated=updated.replaceAll('call the Skill tool for whichever skills','read the SKILL.md files for whichever skills');
  if (/\bSkill tool\b/i.test(updated)) throw new Error('Unmapped skill-loading instruction: '+filename);
  return updated;
}
function stamp(text, filename) {
  const target = path.posix.relative(path.posix.dirname(filename),'PROJECT-CONTEXT.md');
  const policy = '> Before following this document, read ['+path.posix.basename(target)+']('+target+'). Upstream project paths are mapped there to private external storage.\n\n';
  if (!filename.endsWith('/SKILL.md')) return policy+text;
  const header = frontmatter(text);
  const compat = path.posix.relative(path.posix.dirname(filename),'PI-COMPATIBILITY.md');
  return header+'\nBefore following this skill, read ['+path.posix.basename(compat)+']('+compat+') for Pi mechanics and ['+path.posix.basename(target)+']('+target+') for project storage.\n'+text.slice(header.length);
}
export async function buildMattSkills({sourceDir}) {
  const lock = JSON.parse(await readFile(path.join(configRoot,'config/matt-skills.json'),'utf8'));
  if(git(sourceDir,'remote','get-url','origin')!==lock.upstream) throw new Error('Unexpected Matt skills upstream');
  if(git(sourceDir,'rev-parse','HEAD')!==lock.revision) throw new Error('Source is not the pinned revision; update the lock only after review');
  if(git(sourceDir,'status','--porcelain')) throw new Error('Upstream source checkout must be clean');
  if(lock.skills.length!==20 || new Set(lock.skills).size!==20) throw new Error('The selected skill set must contain exactly twenty unique skills');
  const pinned = await pinnedFiles(sourceDir, lock);
  const output = new Map();
  const upstreamFiles = [];
  const patches = [];
  const coverage = normalize(await readFile(path.join(configRoot,'skills/REVIEW-COVERAGE.md'),'utf8'));
  const render = text => normalize(text).replaceAll('{{CONFIG_ROOT}}',configRoot.replaceAll('\\','/'));
  for(const name of lock.skills) {
    if(!/^[a-z0-9-]+$/.test(name)) throw new Error('Invalid skill selection');
    const prefix = pinned.prefixes.get(name);
    const names = [...pinned.files.keys()].filter(filename => filename.startsWith(prefix)).sort();
    for (const filename of names) {
      const relative = filename.slice(prefix.length);
      const original = pinned.files.get(filename);
      const target = name+'/'+relative;
      upstreamFiles.push({path:filename,sha256:digest(original)});
      if(!relative.endsWith('.md')) { output.set(target,original); continue; }
      let text = normalize(original.toString('utf8'));
      if(target==='setup-matt-pocock-skills/SKILL.md') {
        text=render(await readFile(path.join(configRoot,'skills/setup-matt-pocock-skills.md'),'utf8'));
        patches.push({path:target,kind:'project-policy',patch:'external-inherited-setup'});
      } else if(target==='code-review/SKILL.md') {
        text=replaceOnce(text,'Two-axis review of the diff between `HEAD` and a fixed point the user supplies:','Two-axis review of committed changes or the current working tree against an agreed fixed point:',target);
        text=replaceOnce(text,'The issue tracker should have been provided to you. If not, tell the user to run `/setup-matt-pocock-skills`.','Resolve inherited external project context first. Standalone review accepts the user requirements as its spec; tracker setup is not a prerequisite. If no requirements/spec exist, ask or report Spec skipped with the user\'s agreement.',target);
        const begin=text.indexOf('### 1. Pin the fixed point');
        const end=text.indexOf('### 2. Identify the spec source');
        if(begin<0||end<=begin) throw new Error('Upstream review sections changed');
        text=text.slice(0,begin)+coverage+'\n'+text.slice(end);
        patches.push({path:target,kind:'pi-mechanics',patch:'working-tree-and-new-file-review'});
      } else if(target==='implement/SKILL.md') {
        text=replaceOnce(text,'Once done, call the Skill tool with "code-review" to review the work.','Once done, load code-review for working-tree review against the recorded initial HEAD, including staged, unstaged and relevant new task-owned files. Supply the requirements and collect the independent reports.',target);
        text=replaceOnce(text,'Commit your work to the current branch.','Follow the user\'s publication policy from the loaded global instructions. This skill does not authorize a commit, push, PR or MR.',target);
        patches.push({path:target,kind:'user-policy',patch:'review-before-explicit-publication'});
      }
      const native=nativeSkillLoading(text,target,lock.skills);
      if(native!==text) patches.push({path:target,kind:'pi-mechanics',patch:'native-file-skill-loading'});
      output.set(target,Buffer.from(stamp(native,target)));
    }
  }
  output.set('LICENSE',pinned.files.get('LICENSE'));
  for(const name of ['PI-COMPATIBILITY.md','PROJECT-CONTEXT.md']) output.set(name,Buffer.from(render(await readFile(path.join(configRoot,'skills',name),'utf8'))));
  const manifest={schemaVersion:2,adaptation:lock.adaptation,upstream:lock.upstream,revision:lock.revision,skills:lock.skills,patches:[{path:'*/**/*.md',kind:'project-policy',patch:'explicit-external-storage-pointer'},...patches],upstreamFiles,files:[...output].sort(([a],[b])=>a.localeCompare(b)).map(([name,data])=>({path:name,sha256:digest(data)}))};
  output.set('PROVENANCE.json',Buffer.from(JSON.stringify(manifest,null,2)+'\n'));
  return {output,manifest};
}
export async function verifyManagedSkills(destination) {
  const stat = await lstat(destination);
  if(stat.isSymbolicLink()||!stat.isDirectory()) throw new Error('Managed destination must be a real directory');
  let manifest;
  try { manifest=JSON.parse(await readFile(path.join(destination,'PROVENANCE.json'),'utf8')); }
  catch { throw new Error('Unmanaged destination; preserve it outside skill discovery first'); }
  const lock = JSON.parse(await readFile(path.join(configRoot, 'config/matt-skills.json'), 'utf8'));
  if (manifest.schemaVersion !== 2 || manifest.adaptation !== lock.adaptation || manifest.upstream !== lock.upstream
    || !/^[a-f0-9]{40}$/i.test(manifest.revision) || !Array.isArray(manifest.skills) || manifest.skills.length !== 20
    || new Set(manifest.skills).size !== 20 || !manifest.skills.every(name => /^[a-z0-9-]+$/.test(name))
    || !Array.isArray(manifest.files)) throw new Error('Unsupported or foreign installer provenance');
  const expected = new Set(['PROVENANCE.json']);
  for(const file of manifest.files) {
    if(!safePath(file.path)||expected.has(file.path)||!/^[a-f0-9]{64}$/i.test(file.sha256)) throw new Error('Unsafe or duplicate provenance path');
    expected.add(file.path);
  }
  const actual=await filesUnder(destination);
  if(actual.some(name=>!expected.has(name))||actual.length!==expected.size) throw new Error('Managed skill drift: unknown or missing files');
  for(const file of manifest.files) if(digest(await readFile(path.join(destination,file.path)))!==file.sha256.toLowerCase()) throw new Error('Managed skill modified: '+file.path);
  return manifest;
}
function skillDiscoveryAncestors(directory) {
  const roots = [];
  for (let current = path.resolve(directory); ; current = path.dirname(current)) {
    if (path.basename(current).toLowerCase() === 'skills') roots.push(current);
    if (path.dirname(current) === current) return roots;
  }
}
export async function installMattSkills({sourceDir,destination,apply=false,backupRoot}) {
  destination=path.resolve(destination);
  if(path.basename(destination)!=='matt-pocock') throw new Error('Skill destination must be a dedicated matt-pocock directory');
  const {output,manifest}=await buildMattSkills({sourceDir});
  const exists=existsSync(destination);
  const previous = exists ? await verifyManagedSkills(destination) : null;
  const changed=!exists || [...output].some(([name,data])=>!existsSync(path.join(destination,name))||digest(data)!==digest(readBuffer(path.join(destination,name))));
  const report={mode:apply?'apply':'plan',changed,revision:manifest.revision,adaptation:manifest.adaptation,skills:manifest.skills,files:output.size,destination};
  if(!apply||!changed) return report;
  await mkdir(path.dirname(destination), {recursive:true});
  const parent = await realpath(path.dirname(destination));
  // Keep state above a conventional skills root, including nested destinations.
  const discoveryRoot = skillDiscoveryAncestors(parent).at(-1) ?? parent;
  const stateRoot = path.join(path.dirname(discoveryRoot), '.pi-config-state');
  await mkdir(stateRoot, {recursive:true, mode:0o700});
  if ((await lstat(stateRoot)).isSymbolicLink()) throw new Error('Installer state must not be a symbolic link');
  const lockPath = path.join(stateRoot, 'matt-' + digest(path.join(parent, path.basename(destination)).toLowerCase()).slice(0,24) + '.lock');
  return withInstallLock(lockPath, async () => {
    const stage = await mkdtemp(path.join(stateRoot, 'matt-stage-'));
    let backup;
    let oldMoved = false;
    try {
      for (const [name,data] of output) {
        await mkdir(path.dirname(path.join(stage,name)), {recursive:true});
        await writeFile(path.join(stage,name), data, {flag:'wx'});
      }
      await verifyManagedSkills(stage);
      const backupDirectory = path.resolve(backupRoot ?? path.join(stateRoot, 'backups'));
      if (skillDiscoveryAncestors(backupDirectory).length) throw new Error('Backups must be outside skill discovery');
      await mkdir(backupDirectory, {recursive:true, mode:0o700});
      const canonicalBackup = await realpath(backupDirectory);
      if (skillDiscoveryAncestors(canonicalBackup).length) throw new Error('Backups must be outside skill discovery');
      const relative = path.relative(discoveryRoot, canonicalBackup);
      if (!relative || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative))) throw new Error('Backups must be outside skill discovery');
      if ((await stat(canonicalBackup)).dev !== (await stat(parent)).dev) throw new Error('Backups must be on the destination volume');
      if (existsSync(destination) !== exists) throw new Error('Managed destination changed during installation');
      if (exists) {
        const current = await verifyManagedSkills(destination);
        if (JSON.stringify(current) !== JSON.stringify(previous)) throw new Error('Managed destination changed during installation');
        backup = path.join(canonicalBackup, 'matt-pocock-' + Date.now() + '-' + process.pid);
        await rename(destination,backup);
        oldMoved = true;
      }
      try { await rename(stage,destination); }
      catch(error) { if(oldMoved) await rename(backup,destination); throw error; }
      return {...report,backup:backup??null};
    } finally { await rm(stage,{recursive:true,force:true}); }
  });
}
function readBuffer(filename) { return readFileSync(filename); }
import { readFileSync } from 'node:fs';
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {
    const args=process.argv.slice(2); const values={}; let apply=false;
    for(let i=0;i<args.length;i++) {
      if(args[i]==='--apply') apply=true;
      else if(['--source','--destination','--backup-root'].includes(args[i])&&args[i+1]) values[args[i].slice(2)]=args[++i];
      else throw new Error('Usage: matt-skills.mjs --source DIR --destination DIR [--backup-root DIR] [--apply]');
    }
    if(!values.source||!values.destination) throw new Error('Source and destination are required');
    console.log(JSON.stringify(await installMattSkills({sourceDir:path.resolve(values.source),destination:values.destination,backupRoot:values['backup-root'],apply}),null,2));
  } catch(error) { console.error(error.message); process.exitCode=1; }
}
