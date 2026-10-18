#!/usr/bin/env node
import { readFile, writeFile, mkdir, rename, lstat, rm, open } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { withInstallLock } from './install-lock.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const begin='<!-- pi-config:begin -->';
const end='<!-- pi-config:end -->';
const hash=text=>createHash('sha256').update(text).digest('hex');
export function composeMachineInstructions(original,{profile,configRoot=root}) {
  if(!['home','work'].includes(profile)) throw new Error('Choose profile home or work');
  configRoot=path.resolve(configRoot).replaceAll('\\','/');
  if(/[\r\n]/.test(configRoot)) throw new Error('Invalid configuration source path');
  const body=[
    '# Personal Pi configuration',
    '',
    'Read ['+profile+' profile]('+configRoot+'/instructions/'+profile+'.md) and [common user policy]('+configRoot+'/instructions/common.md) before acting on this machine.',
    '',
    'Before using a workflow that needs tracker settings or personal project artifacts, resolve the actual working directory:',
    '',
    '\`\`\`powershell',
    'node "'+configRoot+'/scripts/project-context.mjs" --cwd "<actual working directory>"',
    '\`\`\`',
    '',
    'Use its inherited profile, tracker, external paths and existing private instruction pointers. Setup is optional when inherited settings already suffice.',
    'Machine-private instructions outside this managed block are preserved. Commit and publication authorization is separate from implementation.',
    ''
  ].join('\n');
  const block=begin+'\n<!-- pi-config:sha256:'+hash(body)+' -->\n'+body+end+'\n\n';
  const starts=original.split(begin).length-1, ends=original.split(end).length-1;
  if(starts===0&&ends===0) return block+original;
  if(starts!==1||ends!==1) throw new Error('Malformed or duplicate pi-config block; preserve and reconcile manually');
  const from=original.indexOf(begin),to=original.indexOf(end,from);
  const current=original.slice(from,to+end.length);
  const match=current.match(/^<!-- pi-config:begin -->\r?\n<!-- pi-config:sha256:([a-f0-9]{64}) -->\r?\n([\s\S]*)<!-- pi-config:end -->$/);
  if(!match||hash(match[2])!==match[1]) throw new Error('Managed pi-config block was modified; reconcile it before updating');
  // The separator after the old block is retained byte-for-byte.
  return original.slice(0,from)+block.trimEnd()+original.slice(to+end.length);
}
const changedDuringInstall=()=>new Error('AGENTS.md changed during install; nothing was replaced, review and retry');
const sameIdentity=(left,right)=>Boolean(left&&right)&&['dev','ino','size','mtimeNs','ctimeNs'].every(key=>left[key]===right[key]);
async function targetInfo(target) {
  try { return await lstat(target,{bigint:true}); }
  catch(error) { if(error.code==='ENOENT') return null; throw error; }
}
async function captureTarget(target) {
  const stat=await targetInfo(target);
  if(!stat) return null;
  if(stat.isSymbolicLink()) throw new Error('AGENTS.md is a symbolic link; use its explicit managed owner instead');
  let content;
  try { content=await readFile(target); }
  catch(error) { if(error.code==='ENOENT') throw changedDuringInstall(); throw error; }
  if(!sameIdentity(stat,await targetInfo(target))) throw changedDuringInstall();
  return {stat,content};
}
function sameTarget(original,current) {
  if(!original||!current) return original===current;
  return sameIdentity(original.stat,current.stat)&&original.content.equals(current.content);
}
export async function installMachineProfile({agentsDir=process.env.PI_CODING_AGENT_DIR||path.join(homedir(),'.pi','agent'),profile,apply=false,backupRoot}) {
  agentsDir=path.resolve(agentsDir);
  const operation=()=>updateMachineProfile({agentsDir,profile,apply,backupRoot});
  if(!apply) return operation();
  await mkdir(agentsDir,{recursive:true});
  return withInstallLock(path.join(agentsDir,'.pi-config-install.lock'),operation);
}
async function updateMachineProfile({agentsDir,profile,apply,backupRoot}) {
  const target=path.join(agentsDir,'AGENTS.md');
  const snapshot=await captureTarget(target);
  const exists=Boolean(snapshot);
  const original=snapshot?snapshot.content.toString('utf8'):'';
  const updated=composeMachineInstructions(original,{profile});
  const report={mode:apply?'apply':'plan',profile,target,changed:original!==updated,privateContentPreserved:true};
  if(!apply||!report.changed) return report;
  let backup=null;
  if(exists) {
    backupRoot=path.resolve(backupRoot??path.join(agentsDir,'..','pi-config-backups'));
    await mkdir(backupRoot,{recursive:true});
    backup=path.join(backupRoot,'AGENTS-'+randomUUID()+'.md');
    await writeFile(backup,snapshot.content,{flag:'wx',mode:0o600});
  }
  const temporary=target+'.pi-config-'+randomUUID()+'.tmp';
  const staged=await open(temporary,'wx',0o600);
  let stageIdentity;
  try {
    try {
      stageIdentity=await staged.stat({bigint:true});
      await writeFile(staged,updated);
    } finally { await staged.close(); }
    // The lock serializes cooperating installers. Revalidation detects external
    // edits up to this point, but cannot close the final check/rename race with
    // noncooperating editors; stop those editors while applying.
    if(!sameTarget(snapshot,await captureTarget(target))) throw changedDuringInstall();
    await rename(temporary,target);
  } finally {
    const current=await targetInfo(temporary);
    if(stageIdentity&&current?.isFile()&&stageIdentity.dev===current.dev&&stageIdentity.ino===current.ino) await rm(temporary,{force:true});
  }
  return {...report,backup};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {
    const args=process.argv.slice(2),values={}; let apply=false;
    for(let i=0;i<args.length;i++) {
      if(args[i]==='--apply') apply=true;
      else if(['--profile','--agents-dir','--backup-root'].includes(args[i])&&args[i+1]) values[args[i].slice(2)]=args[++i];
      else throw new Error('Usage: machine-profile.mjs --profile home|work [--agents-dir DIR] [--backup-root DIR] [--apply]');
    }
    console.log(JSON.stringify(await installMachineProfile({agentsDir:values['agents-dir'],profile:values.profile,backupRoot:values['backup-root'],apply}),null,2));
  } catch(error) {console.error(error.message); process.exitCode=1;}
}
