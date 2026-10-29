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
// The tag endpoint only returns published releases. List authenticated releases
// to find drafts, and retain the ID returned by create/update throughout.
const pages=await api(['--paginate','--slurp',`repos/${repo}/releases?per_page=100`]);
if(!Array.isArray(pages) || pages.some(page=>!Array.isArray(page)))throw new Error('GitHub did not return release pages.');
const matches=pages.flat().filter(release=>release.tag_name===tag);
if(matches.length>1)throw new Error('More than one release uses this version. Resolve the drafts before retrying.');
const existing=matches[0];
if(existing && (existing.draft!==true || existing.prerelease!==false || !Number.isSafeInteger(existing.id) || !Array.isArray(existing.assets)))throw new Error('This version already exists or is not a stable draft. Increment the app version.');
if(existing && existing.target_commitish!==actual.commit && existing.assets.length)throw new Error('An existing draft contains downloads from another commit. Increment the app version.');
const requestFile=path.join(directory,'release-request.json');
await fs.writeFile(requestFile,JSON.stringify({tag_name:tag,target_commitish:actual.commit,name:`Study Tool ${actual.version}`,body:await fs.readFile(path.join(directory,'release-notes.md'),'utf8'),draft:true,prerelease:false}));
const draft=await api(['--method',existing ? 'PATCH' : 'POST',existing ? `repos/${repo}/releases/${existing.id}` : `repos/${repo}/releases`,'--input',requestFile]);
if(!Number.isSafeInteger(draft.id) || draft.draft!==true || draft.prerelease!==false || draft.tag_name!==tag || draft.target_commitish!==actual.commit)throw new Error('The returned draft does not match this build. Nothing was published.');
const files=[...actual.assets.map(a=>path.join(directory,a.name)),path.join(directory,'release-info.json'),path.join(directory,'SHA256SUMS.txt')];
await run(['release','upload',tag,...files,'--repo',repo,'--clobber']);
const uploaded=await api([`repos/${repo}/releases/${draft.id}`]);verifyPublishedAssets(actual,uploaded);
await api(['--method','PATCH',`repos/${repo}/releases/${draft.id}`,'-F','draft=false','-f','make_latest=true']);
process.stdout.write(`Published ${tag} with both verified Mac downloads.\n`);
