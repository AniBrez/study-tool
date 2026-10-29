import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { WorkspaceStore } from '../desktop/storage.mjs';
import { clone } from '../dist/model.mjs';

async function temporary(t,options) {
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'study-tool-test-'));
  t.after(()=>fs.rm(dir,{recursive:true,force:true}));
  return new WorkspaceStore(dir,options);
}
test('first launch creates an ordinary, valid local workspace file',async t=>{
  const store=await temporary(t);const result=await store.load();
  const onDisk=JSON.parse(await fs.readFile(store.file,'utf8'));
  assert.deepEqual(onDisk,result.workspace);
  assert.equal(onDisk.topics.length,2);
  assert.ok(result.workspacePath.endsWith('workspace.json'));
});
test('queued saves keep the newest version, retain bounded backups, and survive reopening',async t=>{
  const store=await temporary(t,{keepBackups:4});const initial=(await store.load()).workspace;
  const writes=[];
  for(let i=0;i<12;i++) {const next=clone(initial);next.topics[0].title=`Saved ${i}`;writes.push(store.save(next));}
  await Promise.all(writes);await store.flush();
  assert.equal(JSON.parse(await fs.readFile(store.file,'utf8')).topics[0].title,'Saved 11');
  const backups=await fs.readdir(store.backups);assert.equal(backups.length,4);
  for(const name of backups)assert.equal(JSON.parse(await fs.readFile(path.join(store.backups,name),'utf8')).version,2);
  const reopened=await new WorkspaceStore(store.directory).load();assert.equal(reopened.workspace.topics[0].title,'Saved 11');
});
test('a failed replacement preserves the last saved workspace and permits retry',async t=>{
  const store=await temporary(t);const initial=(await store.load()).workspace;
  const file=store.file;const target=path.join(store.directory,'occupied');await fs.mkdir(target);
  store.file=target;
  const next=clone(initial);next.topics[0].title='Recovered after failure';
  await assert.rejects(store.save(next));await assert.rejects(store.flush());
  assert.deepEqual(JSON.parse(await fs.readFile(file,'utf8')),initial);
  assert.equal(store.current.topics[0].title,initial.topics[0].title);
  store.file=file;await store.save(store.latestRequested);await store.flush();
  assert.equal(JSON.parse(await fs.readFile(file,'utf8')).topics[0].title,'Recovered after failure');
});
test('a damaged workspace recovers a valid backup and preserves the damaged original',async t=>{
  const store=await temporary(t);const original=(await store.load()).workspace;
  const next=clone(original);next.topics[0].title='A later version';await store.save(next);
  await fs.writeFile(store.file,'damaged-file-contents');
  const recovered=await new WorkspaceStore(store.directory).load();
  assert.deepEqual(recovered.workspace,original);assert.match(recovered.notice,/Recovered/);
  const retained=(await fs.readdir(store.directory)).find(n=>n.startsWith('workspace-unreadable-'));
  assert.equal(await fs.readFile(path.join(store.directory,retained),'utf8'),'damaged-file-contents');
});
test('an unreadable workspace with no backup is never silently replaced',async t=>{
  const store=await temporary(t);await fs.writeFile(store.file,'unreadable');
  await assert.rejects(store.load(),/preserved/);
  assert.equal(await fs.readFile(store.file,'utf8'),'unreadable');
});
test('invalid workspace data cannot overwrite saved data',async t=>{
  const store=await temporary(t);await store.load();const original=await fs.readFile(store.file,'utf8');
  await assert.rejects(store.save({version:99,topics:[]}));
  assert.equal(await fs.readFile(store.file,'utf8'),original);
});
test('upgrading a legacy workspace retains its exact original bytes independently of rolling backups',async t=>{
  const store=await temporary(t,{keepBackups:1});
  const data=(await store.load()).workspace;
  const old={version:1,topics:data.topics};for(const topic of old.topics)for(const edge of topic.edges)delete edge.style;
  const original=JSON.stringify(old,null,4)+'\n';await fs.writeFile(store.file,original);
  const upgraded=new WorkspaceStore(store.directory,{keepBackups:1});const result=await upgraded.load();
  assert.equal(result.workspace.version,2);assert.deepEqual(result.workspace.topics.map(t=>t.nodes),old.topics.map(t=>t.nodes));
  assert.equal(await fs.readFile(store.file,'utf8'),original,'Opening the app does not overwrite the legacy file.');
  const directory=path.join(store.directory,'migration-backups'),names=await fs.readdir(directory);
  assert.equal(names.length,1);assert.equal(await fs.readFile(path.join(directory,names[0]),'utf8'),original);
  for(let i=0;i<3;i++){const next=structuredClone(result.workspace);next.topics[0].title=`New format ${i}`;await upgraded.save(next);}
  assert.equal((await fs.readdir(upgraded.backups)).length,1);
  assert.equal(await fs.readFile(path.join(directory,names[0]),'utf8'),original);
  assert.equal((await new WorkspaceStore(store.directory).load()).workspace.topics[0].title,'New format 2');
});
test('a workspace from a future app version is preserved instead of reverting to older backups',async t=>{
  const store=await temporary(t);await store.load();await store.save(store.current);
  const future=JSON.stringify({...store.current,version:3});await fs.writeFile(store.file,future);
  await assert.rejects(new WorkspaceStore(store.directory).load(),/newer Study Tool/);
  assert.equal(await fs.readFile(store.file,'utf8'),future);
});
