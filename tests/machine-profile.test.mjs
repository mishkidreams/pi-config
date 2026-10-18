import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm, readdir, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import fs from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { installMachineProfile } from '../scripts/machine-profile.mjs';
import { withInstallLock } from '../scripts/install-lock.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const cli=path.join(root,'scripts/machine-profile.mjs');
function run(agentsDir,profile,...extra) { return spawnSync(process.execPath,[cli,'--agents-dir',agentsDir,'--profile',profile,...extra],{encoding:'utf8'}); }
test('the default profile command targets the active Pi directory and honors an explicit override',async()=>{
  const temporary=await mkdtemp(path.join(tmpdir(),'pi-config-active-agent-'));
  const home=path.join(temporary,'home'),active=path.join(temporary,'active-agent');
  const env={...process.env,HOME:home,USERPROFILE:home,PI_CODING_AGENT_DIR:active};
  const invoke=(...args)=>spawnSync(process.execPath,[cli,'--profile','home',...args],{encoding:'utf8',env});
  try {
    await mkdir(home);
    const plan=invoke();
    assert.equal(plan.status,0,plan.stderr);
    assert.equal(JSON.parse(plan.stdout).target,path.join(active,'AGENTS.md'));
    assert.deepEqual(await readdir(temporary),['home']);
    const applied=invoke('--apply');
    assert.equal(applied.status,0,applied.stderr);
    assert.match(await readFile(path.join(active,'AGENTS.md'),'utf8'),/instructions\/home\.md/);
    assert.deepEqual(await readdir(home),[]);
    const explicit=path.join(temporary,'explicit-agent');
    assert.equal(JSON.parse(invoke('--agents-dir',explicit).stdout).target,path.join(explicit,'AGENTS.md'));
  } finally {await rm(temporary,{recursive:true,force:true});}
});
test('an edit while staging is preserved instead of overwritten and the backup retains the captured original',async t=>{
  const temporary=await mkdtemp(path.join(tmpdir(),'pi-config-stage-drift-'));
  const agentsDir=path.join(temporary,'agent'),backupRoot=path.join(temporary,'backups');
  const target=path.join(agentsDir,'AGENTS.md');
  const original='# Original synthetic private instructions\n';
  const edited='# New synthetic private instructions written while staging\n';
  const realWriteFile=fs.writeFile;
  try {
    await mkdir(agentsDir);
    await realWriteFile(target,original);
    t.mock.method(fs,'writeFile',async(file,...args)=>{
      const result=await realWriteFile(file,...args);
      if((typeof file==='string'&&file.startsWith(target+'.pi-config-'))||typeof file?.fd==='number') await realWriteFile(target,edited);
      return result;
    });
    syncBuiltinESMExports();
    await assert.rejects(installMachineProfile({agentsDir,profile:'home',apply:true,backupRoot}),/AGENTS\.md changed during install/);
    assert.equal(await readFile(target,'utf8'),edited);
    const backups=await readdir(backupRoot);
    assert.equal(backups.length,1);
    assert.equal(await readFile(path.join(backupRoot,backups[0]),'utf8'),original);
    assert.deepEqual(await readdir(agentsDir),['AGENTS.md']);
  } finally {
    t.mock.restoreAll(); syncBuiltinESMExports();
    await rm(temporary,{recursive:true,force:true});
  }
});
test('an edit during backup does not replace private content or change the captured backup',async t=>{
  const temporary=await mkdtemp(path.join(tmpdir(),'pi-config-backup-drift-'));
  const agentsDir=path.join(temporary,'agent'),backupRoot=path.join(temporary,'backups');
  const target=path.join(agentsDir,'AGENTS.md');
  const original='# Captured synthetic private instructions\n';
  const edited='# Synthetic private instructions edited during backup\n';
  const realMkdir=fs.mkdir;
  try {
    await mkdir(agentsDir);
    await writeFile(target,original);
    t.mock.method(fs,'mkdir',async(directory,...args)=>{
      const result=await realMkdir(directory,...args);
      if(directory===backupRoot) await writeFile(target,edited);
      return result;
    });
    syncBuiltinESMExports();
    await assert.rejects(installMachineProfile({agentsDir,profile:'home',apply:true,backupRoot}),/AGENTS\.md changed during install/);
    assert.equal(await readFile(target,'utf8'),edited);
    const backups=await readdir(backupRoot);
    assert.equal(backups.length,1);
    assert.equal(await readFile(path.join(backupRoot,backups[0]),'utf8'),original);
    assert.deepEqual(await readdir(agentsDir),['AGENTS.md']);
  } finally {
    t.mock.restoreAll(); syncBuiltinESMExports();
    await rm(temporary,{recursive:true,force:true});
  }
});
test('concurrent applies cannot enter the same installation while planning stays read-only',async t=>{
  const temporary=await mkdtemp(path.join(tmpdir(),'pi-config-lock-'));
  const agentsDir=path.join(temporary,'agent'),target=path.join(agentsDir,'AGENTS.md');
  const original='# Synthetic private instructions protected by the apply lock\n';
  const staged=Promise.withResolvers(),release=Promise.withResolvers();
  const realWriteFile=fs.writeFile;
  let first,held=false;
  try {
    await mkdir(agentsDir);
    await realWriteFile(target,original);
    t.mock.method(fs,'writeFile',async(file,...args)=>{
      const result=await realWriteFile(file,...args);
      if(!held&&((typeof file==='string'&&file.startsWith(target+'.pi-config-'))||typeof file?.fd==='number')) {
        held=true; staged.resolve(); await release.promise;
      }
      return result;
    });
    syncBuiltinESMExports();
    first=installMachineProfile({agentsDir,profile:'home',apply:true});
    await staged.promise;
    const beforePlan=(await readdir(agentsDir)).sort();
    const planned=await installMachineProfile({agentsDir,profile:'work'});
    assert.equal(planned.mode,'plan');
    assert.deepEqual((await readdir(agentsDir)).sort(),beforePlan);
    await assert.rejects(installMachineProfile({agentsDir,profile:'work',apply:true}),/Installation is locked/);
    const concurrentCli=run(agentsDir,'work','--apply');
    assert.notEqual(concurrentCli.status,0);
    assert.match(concurrentCli.stderr,/Installation is locked/);
    assert.equal(await readFile(target,'utf8'),original);
    release.resolve();
    assert.equal((await first).changed,true);
    const installed=await readFile(target,'utf8');
    assert.match(installed,/instructions\/home\.md/);
    assert.ok(installed.endsWith(original));
    assert.deepEqual(await readdir(agentsDir),['AGENTS.md']);
  } finally {
    release.resolve(); await first?.catch(()=>{});
    t.mock.restoreAll(); syncBuiltinESMExports();
    await rm(temporary,{recursive:true,force:true});
  }
});
test('a staging name collision never removes the foreign file',async t=>{
  const temporary=await mkdtemp(path.join(tmpdir(),'pi-config-stage-collision-'));
  const agentsDir=path.join(temporary,'agent'),target=path.join(agentsDir,'AGENTS.md');
  const original='# Original synthetic private instructions\n',foreign='foreign staging content\n';
  const realWriteFile=fs.writeFile,realOpen=fs.open;
  let collision;
  async function collide(file) {
    if(!collision&&typeof file==='string'&&file.startsWith(target+'.pi-config-')) {
      collision=file;
      await realWriteFile(file,foreign,{flag:'wx'});
    }
  }
  try {
    await mkdir(agentsDir);
    await realWriteFile(target,original);
    t.mock.method(fs,'open',async(file,...args)=>{ await collide(file); return realOpen(file,...args); });
    t.mock.method(fs,'writeFile',async(file,...args)=>{ await collide(file); return realWriteFile(file,...args); });
    syncBuiltinESMExports();
    await assert.rejects(installMachineProfile({agentsDir,profile:'home',apply:true}),{code:'EEXIST'});
    assert.equal(await readFile(target,'utf8'),original);
    assert.equal(await readFile(collision,'utf8'),foreign);
    assert.deepEqual((await readdir(agentsDir)).sort(),['AGENTS.md',path.basename(collision)].sort());
  } finally {
    t.mock.restoreAll(); syncBuiltinESMExports();
    await rm(temporary,{recursive:true,force:true});
  }
});
test('a private target created while staging an absent target is never overwritten',async t=>{
  const temporary=await mkdtemp(path.join(tmpdir(),'pi-config-absent-drift-'));
  const agentsDir=path.join(temporary,'agent'),target=path.join(agentsDir,'AGENTS.md');
  const created='# Synthetic private instructions created during install\n';
  const realWriteFile=fs.writeFile;
  try {
    t.mock.method(fs,'writeFile',async(file,...args)=>{
      const result=await realWriteFile(file,...args);
      if((typeof file==='string'&&file.startsWith(target+'.pi-config-'))||typeof file?.fd==='number') await realWriteFile(target,created,{flag:'wx'});
      return result;
    });
    syncBuiltinESMExports();
    await assert.rejects(installMachineProfile({agentsDir,profile:'home',apply:true}),/AGENTS\.md changed during install/);
    assert.equal(await readFile(target,'utf8'),created);
    assert.deepEqual(await readdir(agentsDir),['AGENTS.md']);
    assert.deepEqual(await readdir(temporary),['agent']);
  } finally {
    t.mock.restoreAll(); syncBuiltinESMExports();
    await rm(temporary,{recursive:true,force:true});
  }
});
test('replacing the target with identical content while staging still aborts',async t=>{
  const temporary=await mkdtemp(path.join(tmpdir(),'pi-config-identity-drift-'));
  const agentsDir=path.join(temporary,'agent'),target=path.join(agentsDir,'AGENTS.md');
  const original='# Identical synthetic content, different file owner\n';
  const realWriteFile=fs.writeFile;
  try {
    await mkdir(agentsDir);
    await realWriteFile(target,original);
    t.mock.method(fs,'writeFile',async(file,...args)=>{
      const result=await realWriteFile(file,...args);
      if((typeof file==='string'&&file.startsWith(target+'.pi-config-'))||typeof file?.fd==='number') {
        const replacement=path.join(temporary,'replacement');
        await realWriteFile(replacement,original);
        await fs.rename(replacement,target);
      }
      return result;
    });
    syncBuiltinESMExports();
    await assert.rejects(installMachineProfile({agentsDir,profile:'home',apply:true}),/AGENTS\.md changed during install/);
    assert.equal(await readFile(target,'utf8'),original);
    assert.deepEqual(await readdir(agentsDir),['AGENTS.md']);
  } finally {
    t.mock.restoreAll(); syncBuiltinESMExports();
    await rm(temporary,{recursive:true,force:true});
  }
});
test('planning an absent directory creates no locks, directories or backups',async()=>{
  const temporary=await mkdtemp(path.join(tmpdir(),'pi-config-absent-plan-'));
  try {
    const result=run(path.join(temporary,'missing','agent'),'home');
    assert.equal(result.status,0,result.stderr);
    assert.equal(JSON.parse(result.stdout).changed,true);
    assert.deepEqual(await readdir(temporary),[]);
  } finally { await rm(temporary,{recursive:true,force:true}); }
});
test('an existing foreign apply lock is preserved and never reclaimed automatically',async()=>{
  const temporary=await mkdtemp(path.join(tmpdir(),'pi-config-foreign-lock-'));
  try {
    const agentsDir=path.join(temporary,'agent'),target=path.join(agentsDir,'AGENTS.md');
    const lock=path.join(agentsDir,'.pi-config-install.lock');
    const original='# Synthetic private instructions\n',owner='foreign or stale lock owner\n';
    await mkdir(agentsDir);
    await writeFile(target,original);
    await writeFile(lock,owner);
    const applied=run(agentsDir,'home','--apply');
    assert.notEqual(applied.status,0);
    assert.match(applied.stderr,/Installation is locked/);
    assert.equal(await readFile(lock,'utf8'),owner);
    assert.equal(await readFile(target,'utf8'),original);
    assert.deepEqual((await readdir(agentsDir)).sort(),['.pi-config-install.lock','AGENTS.md']);
    assert.deepEqual(await readdir(temporary),['agent']);
    const planned=run(agentsDir,'home');
    assert.equal(planned.status,0,planned.stderr);
    assert.equal(await readFile(lock,'utf8'),owner);
  } finally { await rm(temporary,{recursive:true,force:true}); }
});
test('the shared apply lock cleans up its own file if writing the owner marker fails',async t=>{
  const temporary=await mkdtemp(path.join(tmpdir(),'pi-config-lock-init-'));
  const lock=path.join(temporary,'install.lock'),failure=new Error('synthetic lock marker write failure');
  const realOpen=fs.open;
  let entered=false;
  try {
    t.mock.method(fs,'open',async(file,...args)=>{
      const handle=await realOpen(file,...args);
      if(file===lock) t.mock.method(handle,'writeFile',async()=>{ throw failure; });
      return handle;
    });
    syncBuiltinESMExports();
    await assert.rejects(withInstallLock(lock,async()=>{ entered=true; }),failure);
    assert.equal(entered,false);
    assert.deepEqual(await readdir(temporary),[]);
  } finally {
    t.mock.restoreAll(); syncBuiltinESMExports();
    await rm(temporary,{recursive:true,force:true});
  }
});
test('the shared apply lock releases after a failed operation but preserves a foreign replacement',async()=>{
  const temporary=await mkdtemp(path.join(tmpdir(),'pi-config-lock-release-'));
  const lock=path.join(temporary,'install.lock');
  try {
    const failure=new Error('synthetic operation failure');
    await assert.rejects(withInstallLock(lock,async()=>{ throw failure; }),failure);
    assert.deepEqual(await readdir(temporary),[]);
    const foreign='foreign replacement owner\n';
    assert.equal(await withInstallLock(lock,async()=>{
      await fs.rename(lock,path.join(temporary,'retired.lock'));
      await writeFile(lock,foreign);
      return 'complete';
    }),'complete');
    assert.equal(await readFile(lock,'utf8'),foreign);
    assert.deepEqual((await readdir(temporary)).sort(),['install.lock','retired.lock']);
  } finally { await rm(temporary,{recursive:true,force:true}); }
});
test('the shared apply lock does not remove a lock whose owner token changed',async()=>{
  const temporary=await mkdtemp(path.join(tmpdir(),'pi-config-lock-owner-'));
  const lock=path.join(temporary,'install.lock'),foreign='different owner token\n';
  try {
    await withInstallLock(lock,async()=>{ await writeFile(lock,foreign); });
    assert.equal(await readFile(lock,'utf8'),foreign);
  } finally { await rm(temporary,{recursive:true,force:true}); }
});
test('home profile is dry-run by default and preserves private original AGENTS on apply',async()=>{
  const temporary=await mkdtemp(path.join(tmpdir(),'pi-config-profile-'));
  try {
    const agentsDir=path.join(temporary,'.pi','agent');
    await mkdir(agentsDir,{recursive:true});
    const privateBody='# Existing private machine instructions\n\nKeep this exact content.\n';
    await writeFile(path.join(agentsDir,'AGENTS.md'),privateBody);
    const planned=run(agentsDir,'home');
    assert.equal(planned.status,0,planned.stderr);
    assert.equal(JSON.parse(planned.stdout).mode,'plan');
    assert.equal(await readFile(path.join(agentsDir,'AGENTS.md'),'utf8'),privateBody);
    const applied=run(agentsDir,'home','--apply');
    assert.equal(applied.status,0,applied.stderr);
    const body=await readFile(path.join(agentsDir,'AGENTS.md'),'utf8');
    assert.ok(body.endsWith(privateBody));
    assert.match(body,/instructions\/common\.md/);
    assert.match(body,/instructions\/home\.md/);
    assert.doesNotMatch(body,/instructions\/work\.md/);
    const repeated=run(agentsDir,'home','--apply');
    assert.equal(repeated.status,0,repeated.stderr);
    assert.equal(await readFile(path.join(agentsDir,'AGENTS.md'),'utf8'),body);
  } finally { await rm(temporary,{recursive:true,force:true}); }
});
test('work profile changes only managed navigation and retains independent private instructions',async()=>{
  const temporary=await mkdtemp(path.join(tmpdir(),'pi-config-work-'));
  try {
    const agentsDir=path.join(temporary,'agent'); await mkdir(agentsDir);
    const privateBody='# Private work rules\nDo not replace these with home rules.\n';
    await writeFile(path.join(agentsDir,'AGENTS.md'),privateBody);
    const applied=run(agentsDir,'work','--apply'); assert.equal(applied.status,0,applied.stderr);
    const body=await readFile(path.join(agentsDir,'AGENTS.md'),'utf8');
    assert.match(body,/instructions\/work\.md/);
    assert.doesNotMatch(body,/instructions\/home\.md/);
    assert.ok(body.endsWith(privateBody));
    assert.deepEqual((await readdir(agentsDir)).sort(),['AGENTS.md']);
  } finally { await rm(temporary,{recursive:true,force:true}); }
});
test('malformed, duplicate and manually changed managed blocks fail without overwriting anything',async()=>{
  const temporary=await mkdtemp(path.join(tmpdir(),'pi-config-guard-'));
  try {
    const agentsDir=path.join(temporary,'agent'); await mkdir(agentsDir);
    const target=path.join(agentsDir,'AGENTS.md');
    await writeFile(target,'# Synthetic private instructions\n');
    assert.equal(run(agentsDir,'home','--apply').status,0);
    const installed=await readFile(target,'utf8');
    const cases=[
      ' repetition\n<!-- pi-config:begin -->\nunfinished\n',
      installed+installed,
      installed.replace('# Personal Pi configuration','# Manually changed navigation')
    ];
    for(const damaged of cases) {
      await writeFile(target,damaged);
      const result=run(agentsDir,'work','--apply');
      assert.notEqual(result.status,0);
      assert.match(result.stderr,/Malformed or duplicate pi-config block|Managed pi-config block was modified/);
      assert.equal(await readFile(target,'utf8'),damaged);
      assert.deepEqual(await readdir(agentsDir),['AGENTS.md']);
    }
  } finally { await rm(temporary,{recursive:true,force:true}); }
});
test('symbolic-link targets, including dangling links, remain untouched',async t=>{
  const temporary=await mkdtemp(path.join(tmpdir(),'pi-config-symlink-'));
  try {
    const agentsDir=path.join(temporary,'agent'),target=path.join(agentsDir,'AGENTS.md');
    const linked=path.join(temporary,'private.md'),privateBody='# Synthetic linked private instructions\n';
    await mkdir(agentsDir);
    await writeFile(linked,privateBody);
    try { await fs.symlink(linked,target,'file'); }
    catch(error) {
      if(['EPERM','EACCES','ENOTSUP'].includes(error.code)) { t.skip('Symbolic links unavailable: '+error.code); return; }
      throw error;
    }
    for(const dangling of [false,true]) {
      if(dangling) await rm(linked);
      for(const extra of [[],['--apply']]) {
        const result=run(agentsDir,'home',...extra);
        assert.notEqual(result.status,0);
        assert.match(result.stderr,/AGENTS\.md is a symbolic link/);
        assert.equal((await fs.lstat(target)).isSymbolicLink(),true);
        assert.deepEqual(await readdir(agentsDir),['AGENTS.md']);
      }
      if(!dangling) assert.equal(await readFile(linked,'utf8'),privateBody);
    }
  } finally { await rm(temporary,{recursive:true,force:true}); }
});
