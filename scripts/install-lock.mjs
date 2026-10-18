import { open, lstat, readFile, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

/**
 * Run an apply under a cooperative, fail-fast exclusive lock. The caller creates
 * the lock's parent directory. Existing locks (including stale ones) are never
 * reclaimed automatically. Editors ignoring this lock still require caller-side
 * target revalidation; this is not an OS-level compare-and-swap for other files.
 */
export async function withInstallLock(lockPath, operation) {
  const owner=randomUUID()+'\n';
  let handle;
  try { handle=await open(lockPath,'wx',0o600); }
  catch(error) {
    if(error.code==='EEXIST') throw new Error('Installation is locked: '+lockPath+'; verify its owner before removing a stale lock',{cause:error});
    throw error;
  }
  let identity,initialized=false;
  try {
    identity=await handle.stat({bigint:true});
    await handle.writeFile(owner);
    initialized=true;
    return await operation();
  } finally {
    await handle.close();
    let current;
    try { current=await lstat(lockPath,{bigint:true}); }
    catch(error) { if(error.code!=='ENOENT') throw error; }
    if(identity&&current?.isFile()&&identity.dev===current.dev&&identity.ino===current.ino) {
      let content;
      try { content=await readFile(lockPath,'utf8'); }
      catch(error) { if(error.code!=='ENOENT') throw error; }
      // A failed marker write can leave a prefix in the file we just created.
      if(content===owner||(!initialized&&typeof content==='string'&&owner.startsWith(content))) await unlink(lockPath);
    }
  }
}
