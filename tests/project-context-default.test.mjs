import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,readdirSync,realpathSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const cli=fileURLToPath(new URL('../scripts/project-context.mjs',import.meta.url));
test('the documented cwd-only command resolves the active Pi agent directory without creating project files',()=>{
 const base=mkdtempSync(path.join(tmpdir(),'project-context-default-'));
 try {
  const cwd=path.join(base,'project'),agentsDir=path.join(base,'private-agent');
  mkdirSync(cwd); mkdirSync(agentsDir);
  const config=JSON.stringify({schemaVersion:1,defaultProfile:'work',profiles:{work:{tracker:{kind:'gitlab',host:'https://code.example'}}}});
  writeFileSync(path.join(agentsDir,'projects.json'),config);
  const env={...process.env,PI_CODING_AGENT_DIR:agentsDir};
  const result=spawnSync(process.execPath,[cli,'--cwd',cwd],{env,encoding:'utf8',timeout:15000});
  assert.equal(result.status,0,result.stderr);
  const context=JSON.parse(result.stdout);
  assert.equal(context.profile,'work');
  assert.equal(context.tracker.host,'https://code.example');
  assert.ok(context.paths.project.startsWith(realpathSync.native(agentsDir)+path.sep));
  assert.deepEqual(readdirSync(cwd),[]);
  assert.equal(readFileSync(path.join(agentsDir,'projects.json'),'utf8'),config);
  const override=path.join(base,'other-agent'); mkdirSync(override);
  const explicit=spawnSync(process.execPath,[cli,'--cwd',cwd,'--agents-dir',override],{env,encoding:'utf8',timeout:15000});
  assert.equal(explicit.status,0,explicit.stderr);
  assert.equal(JSON.parse(explicit.stdout).profile,'personal');
 } finally {rmSync(base,{recursive:true,force:true});}
});
