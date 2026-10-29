import * as fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {releaseInventory,verifyPublishedAssets} from './github-release-assets.mjs';

const exec=promisify(execFile),root=fileURLToPath(new URL('..',import.meta.url)),directory=path.join(root,'out/github-release');
const expected=JSON.parse(await fs.readFile(path.join(directory,'release-info.json'),'utf8'));
const actual=await releaseInventory(directory,{version:expected.version,signed:expected.signed,commit:process.env.GITHUB_SHA});
if(JSON.stringify(actual)!==JSON.stringify(expected))throw new Error('Release archives changed after the build.');
const repo=process.env.GITHUB_REPOSITORY;
if(!/^[a-zA-Z0-9-]+\/[a-zA-Z0-9_.-]+$/.test(repo || ''))throw new Error('Invalid release repository.');
const run=async args=>(await exec('gh',args,{cwd:root,maxBuffer:4*1024*1024})).stdout;
const api=async args=>JSON.parse(await run(['api',...args]));
const repository=await api([`repos/${repo}`]);if(repository.private || repository.visibility!=='public')throw new Error('The updater requires a public release repository. Nothing was published.');
const tag=`v${actual.version}`;
let draft;
try {draft=await api([`repos/${repo}/releases/tags/${tag}`]);}
catch(error){if(!String(error.stderr || '').includes('404'))throw error;}
if(draft && (!draft.draft || draft.target_commitish!==actual.commit))throw new Error('This version already exists or targets a different commit. Increment the app version.');
if(!draft){
  await run(['release','create',tag,'--repo',repo,'--draft','--target',actual.commit,'--title',`Study Tool ${actual.version}`,'--notes-file',path.join(directory,'release-notes.md')]);
  draft=await api([`repos/${repo}/releases/tags/${tag}`]);
}
const files=[...actual.assets.map(a=>path.join(directory,a.name)),path.join(directory,'release-info.json'),path.join(directory,'SHA256SUMS.txt')];
await run(['release','upload',tag,...files,'--repo',repo,'--clobber']);
const uploaded=await api([`repos/${repo}/releases/${draft.id}`]);verifyPublishedAssets(actual,uploaded);
await api(['--method','PATCH',`repos/${repo}/releases/${draft.id}`,'-F','draft=false','-f','make_latest=true']);
process.stdout.write(`Published ${tag} with both verified Mac downloads.\n`);
