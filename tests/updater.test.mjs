import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {AppUpdater} from '../desktop/updater.mjs';
import {httpsAddress, readRelease, newerVersion} from '../desktop/update-feed.mjs';
import {WorkspaceStore} from '../desktop/storage.mjs';
import {createUpdateFeed} from '../scripts/create-update-feed.mjs';

const host='https://updates.study-tool.test/releases';
const manifest=(version='1.2.0')=>({currentRelease:version,releases:[{version,updateTo:{version,url:`${host}/darwin/arm64/Study-Tool-${version}-arm64.zip`,size:300,sha256:'a'.repeat(64),notes:'Lasso improvements.'}}]});
async function fixture(t, {signed=true, fetchImpl=async()=>new Response(JSON.stringify(manifest()))}={}) {
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'study-updates-'));
  t.after(()=>fs.rm(directory,{recursive:true,force:true}));
  const store=new WorkspaceStore(path.join(directory,'workspace'));await store.load();
  const native=new EventEmitter();let checks=0;
  native.setFeedURL=value=>{native.feed=value;};native.checkForUpdates=()=>{checks++;native.emit('update-available');};
  const states=[];
  const updater=new AppUpdater({app:{isPackaged:true,getVersion:()=> '1.1.0'},autoUpdater:native,store,directory,platform:'darwin',arch:'arm64',defaults:{baseUrl:host},signingCheck:async()=>signed,fetchImpl,onChange:s=>states.push(s)});
  await updater.initialize();
  return {directory,store,native,updater,states,checks:()=>checks};
}
test('an unsigned build checks a real feed and offers manual installation without starting a native update',async t=>{
  const {updater,store,checks}=await fixture(t,{signed:false});
  const before=await fs.readFile(store.file,'utf8');
  assert.equal((await updater.check()).phase,'manual');assert.match(updater.downloadAddress(),/1\.2\.0-arm64\.zip$/);
  await assert.rejects(updater.download(),/manual installation/);assert.equal(checks(),0);
  assert.equal(await fs.readFile(store.file,'utf8'),before);
});
test('signed downloads and restart checkpoints retain all existing data, including changes made while downloading',async t=>{
  const {updater,store,native,checks}=await fixture(t);
  const old=await fs.readFile(store.file,'utf8');
  assert.equal((await updater.check()).phase,'available');
  const both=await Promise.all([updater.download(),updater.download()]);assert.equal(checks(),1);assert.equal(both[0].phase,'downloading');
  assert.equal(native.feed.url,`${host}/darwin/arm64/RELEASES.json`);assert.equal(native.feed.serverType,'json');
  let backups=await fs.readdir(path.join(store.directory,'update-backups'));
  assert.equal(backups.length,1);assert.equal(await fs.readFile(path.join(store.directory,'update-backups',backups[0]),'utf8'),old);
  const next=structuredClone(store.current);next.topics[0].title='Work saved during download';
  next.topics[0].nodes[0].proof='Proof text remains intact.';
  // Use a proof-bearing node so validation retains this field.
  const theorem=next.topics[0].nodes.find(n=>n.type==='theorem');theorem.proof='New proof during download.';
  const pending=store.save(next);native.emit('update-downloaded',{},'New notes.','1.2.0');
  const checkpoint=await updater.backupBeforeInstall();await pending;
  const expected=JSON.parse(await fs.readFile(store.file,'utf8'));
  assert.deepEqual(JSON.parse(await fs.readFile(checkpoint,'utf8')),expected);
  assert.equal(expected.topics[0].title,'Work saved during download');assert.equal(expected.topics[0].nodes.find(n=>n.type==='theorem').proof,'New proof during download.');
  assert.deepEqual((await new WorkspaceStore(store.directory).load()).workspace,expected);
  assert.equal(updater.getState().phase,'ready');
});
test('save and checkpoint failures prevent download or installation',async t=>{
  const {updater,store,checks,native}=await fixture(t);await updater.check();
  const checkpoint=store.checkpoint.bind(store);store.checkpoint=async()=>{throw new Error('Disk is full');};
  await assert.rejects(updater.download(),/Disk is full/);assert.equal(checks(),0);
  store.checkpoint=checkpoint;await updater.check();await updater.download();native.emit('update-downloaded',{},'','');
  const old=await fs.readFile(store.file,'utf8'),file=store.file;store.file=path.join(store.directory,'occupied');await fs.mkdir(store.file);
  await assert.rejects(store.save({...store.current,topics:[]}));
  await assert.rejects(updater.backupBeforeInstall());assert.equal(await fs.readFile(file,'utf8'),old);
});
test('offline, invalid and cross-host feeds leave the workspace unchanged and do not claim it is current',async t=>{
  const invalid=manifest();invalid.releases[0].updateTo.url='https://unrelated.test/bundle.zip';
  for(const body of [null,'<html>Sign in</html>',JSON.stringify(invalid)]) {
    const f=await fixture(t,{fetchImpl:async()=>{if(body===null)throw new Error('Offline');return new Response(body);}});
    const before=await fs.readFile(f.store.file,'utf8');
    assert.equal((await f.updater.check()).phase,'error');assert.equal(f.checks(),0);assert.equal(await fs.readFile(f.store.file,'utf8'),before);
    assert.throws(()=>f.updater.downloadAddress(),/Check for an update/);
  }
});
test('concurrent checks use one request and setting changes are blocked until it finishes',async t=>{
  let resolve,requests=0;
  const f=await fixture(t,{fetchImpl:()=>{requests++;return new Promise(r=>{resolve=r;});}});
  const a=f.updater.check(),b=f.updater.check();
  await assert.rejects(f.updater.configure({baseUrl:'https://new.test'}),/Finish/);
  resolve(new Response(JSON.stringify(manifest())));await Promise.all([a,b]);assert.equal(requests,1);
  await f.updater.configure({baseUrl:host,autoCheck:true});
  assert.equal(JSON.parse(await fs.readFile(path.join(f.directory,'update-settings.json'),'utf8')).autoCheck,true);
});
test('version comparisons, HTTPS validation and release integrity fields reject unsafe metadata',()=>{
  assert.equal(newerVersion('1.10.0','1.9.9'),true);assert.equal(newerVersion('1.1.0','1.1.0'),false);
  for(const url of ['http://updates.test','file:///tmp/a','https://u:p@host.test/path','https://host.test/path#secret'])assert.throws(()=>httpsAddress(url));
  assert.throws(()=>httpsAddress('https://host.test/path?token=x',{base:true}));
  const invalid=manifest();invalid.releases[0].updateTo.sha256='oops';assert.throws(()=>readRelease(invalid,'1.1.0',host),/checksum/);
  assert.equal(readRelease(manifest('1.0.1'),'1.1.0',host).newer,false);
});
test('the publishing helper produces a feed and archive the app can consume, with the correct checksum',async t=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'study-release-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
  const zip=path.join(dir,'app.zip');await fs.writeFile(zip,'test archive bytes');
  const raw=await createUpdateFeed({baseUrl:host,arch:'x64',zip,output:path.join(dir,'public'),version:'1.2.0',notes:'Release notes.'});
  assert.equal(readRelease(raw,'1.1.0',host).newer,true);
  const {createHash}=await import('node:crypto');assert.equal(raw.releases[0].updateTo.sha256,createHash('sha256').update('test archive bytes').digest('hex'));
  assert.equal(await fs.readFile(path.join(dir,'public/darwin/x64/Study-Tool-1.2.0-x64.zip'),'utf8'),'test archive bytes');
});
