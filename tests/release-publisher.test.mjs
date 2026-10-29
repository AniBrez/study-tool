import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {releaseInventory} from '../scripts/github-release-assets.mjs';
import {githubAssetName} from '../desktop/update-feed.mjs';

const exec=promisify(execFile),source=fileURLToPath(new URL('..',import.meta.url));
const commit='a'.repeat(40),version='1.3.0';
async function fixture(t,{existing=null,badDigest=false}={}) {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'study-publisher-'));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  for(const folder of ['scripts','desktop','out/github-release','bin'])await fs.mkdir(path.join(root,folder),{recursive:true});
  for(const file of ['scripts/ci-publish-release.mjs','scripts/github-release-assets.mjs','desktop/update-feed.mjs'])await fs.copyFile(path.join(source,file),path.join(root,file));
  const directory=path.join(root,'out/github-release');
  for(const arch of ['arm64','x64'])await fs.writeFile(path.join(directory,githubAssetName(version,arch,{signed:false})),`${arch} archive fixture`);
  const inventory=await releaseInventory(directory,{version,signed:false,commit});
  await fs.writeFile(path.join(directory,'release-info.json'),JSON.stringify(inventory));
  await fs.writeFile(path.join(directory,'release-notes.md'),'First release\nwith two lines.\n');
  await fs.writeFile(path.join(directory,'SHA256SUMS.txt'),'fixture checksums');
  const stateFile=path.join(root,'fake-github.json');
  await fs.writeFile(stateFile,JSON.stringify({release:existing,badDigest,calls:[]}));
  await fs.writeFile(path.join(root,'bin/gh'),`#!${process.execPath}\n`+String.raw`
const fs=require('node:fs'),crypto=require('node:crypto'),path=require('node:path');
const args=process.argv.slice(2),file=process.env.STUDY_TEST_GITHUB_STATE,state=JSON.parse(fs.readFileSync(file,'utf8'));
state.calls.push(args);const save=()=>fs.writeFileSync(file,JSON.stringify(state));
if(args.some(a=>a.includes('/releases/tags/'))){save();process.stderr.write('Drafts have no published tag endpoint');process.exit(1);}
let result;
if(args[0]==='release' && args[1]==='upload'){
  const assets=args.slice(3,args.indexOf('--repo'));
  state.release.assets=assets.map(file=>{const bytes=fs.readFileSync(file);return {name:path.basename(file),state:'uploaded',size:bytes.length,digest:'sha256:'+crypto.createHash('sha256').update(bytes).digest('hex')};});
  if(state.badDigest)state.release.assets[0].digest='sha256:'+'0'.repeat(64);
  result='';
}else if(args[0]==='api'){
  const endpoint=args.find(a=>a.startsWith('repos/'));
  const method=args.includes('--method')?args[args.indexOf('--method')+1]:'GET';
  if(endpoint==='repos/StudyToolTests/study-tool')result={private:false,visibility:'public'};
  else if(method==='GET' && endpoint.includes('?per_page=100'))result=[state.release?[state.release]:[]];
  else if(args.includes('--input')){
    const body=JSON.parse(fs.readFileSync(args[args.indexOf('--input')+1],'utf8'));
    state.release={id:71,assets:[],...state.release,...body};result=state.release;
  }else if(method==='GET' && endpoint.endsWith('/71'))result=state.release;
  else if(method==='PATCH' && args.includes('draft=false')){state.release.draft=false;state.published=true;result=state.release;}
  else throw new Error('Unexpected GitHub request '+JSON.stringify(args));
}else throw new Error('Unexpected CLI command');
save();process.stdout.write(typeof result==='string'?result:JSON.stringify(result));
`,{mode:0o755});
  return {root,stateFile,run:()=>exec(process.execPath,[path.join(root,'scripts/ci-publish-release.mjs')],{env:{...process.env,PATH:path.join(root,'bin')+path.delimiter+process.env.PATH,GITHUB_REPOSITORY:'StudyToolTests/study-tool',GITHUB_SHA:commit,STUDY_TEST_GITHUB_STATE:stateFile}}),state:async()=>JSON.parse(await fs.readFile(stateFile,'utf8'))};
}

test('publisher creates a draft by ID and publishes only after both uploaded archives match',async t=>{
  const f=await fixture(t);await f.run();const state=await f.state();
  assert.equal(state.published,true);assert.equal(state.release.target_commitish,commit);
  assert.equal(state.release.body,'First release\nwith two lines.\n');
  assert.equal(state.release.assets.filter(a=>a.name.endsWith('.zip')).length,2);
  assert.equal(state.calls.some(a=>a.some(v=>v.includes('/releases/tags/'))),false);
});
test('publisher can recover an empty unpublished draft left by an earlier failed source commit',async t=>{
  const existing={id:71,tag_name:'v1.3.0',draft:true,prerelease:false,target_commitish:'b'.repeat(40),assets:[]};
  const f=await fixture(t,{existing});await f.run();const state=await f.state();
  assert.equal(state.published,true);assert.equal(state.release.id,71);assert.equal(state.release.target_commitish,commit);
});
test('publisher retains a draft when GitHub does not confirm an uploaded archive checksum',async t=>{
  const f=await fixture(t,{badDigest:true});await assert.rejects(f.run(),/checksum/);
  const state=await f.state();assert.equal(state.published,undefined);assert.equal(state.release.draft,true);
});
test('publisher cannot replace a published version or retarget a draft with existing downloads',async t=>{
  for(const extra of [{draft:false},{assets:[{name:'older-download.zip'}]}]){
    const existing={id:71,tag_name:'v1.3.0',draft:true,prerelease:false,target_commitish:'b'.repeat(40),assets:[],...extra};
    const f=await fixture(t,{existing});await assert.rejects(f.run());
    assert.deepEqual((await f.state()).release,existing);
  }
});
