import * as fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {githubAssetName,updateSource} from '../desktop/update-feed.mjs';
import {releaseInventory} from './github-release-assets.mjs';

if(process.platform !== 'darwin')throw new Error('Use the Mac release workflow.');
const signed=process.env.STUDY_TOOL_RELEASE_MODE === 'signed';
if(!['signed','manual'].includes(process.env.STUDY_TOOL_RELEASE_MODE))throw new Error('Prepare release signing mode first.');
const root=fileURLToPath(new URL('..',import.meta.url)),exec=promisify(execFile);
const {version}=JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8'));
const config=JSON.parse(await fs.readFile(path.join(root,'desktop/release-config.json'),'utf8'));
if(updateSource(config.baseUrl).baseUrl !== `https://github.com/${process.env.GITHUB_REPOSITORY}`)throw new Error('The built app must use this release repository.');
await exec(process.execPath,[path.join(root,'node_modules/@electron-forge/cli/dist/electron-forge.js'),'package','--platform=darwin','--arch=arm64,x64'],{cwd:root,maxBuffer:8*1024*1024});
const output=path.join(root,'out/github-release');await fs.mkdir(output,{recursive:true});
for(const arch of ['arm64','x64']){
  const bundle=path.join(root,'out',`Study Tool-darwin-${arch}`,'Study Tool.app');
  if(signed){
    await exec('/usr/bin/codesign',['--verify','--deep','--strict',bundle]);
    const {stderr}=await exec('/usr/bin/codesign',['--display','--verbose=2',bundle]);
    if(!/^Authority=Developer ID Application:/m.test(stderr))throw new Error('The signed release is missing Developer ID signing.');
    await exec('/usr/sbin/spctl',['--assess','--type','execute','--verbose=2',bundle]);
  }
  const zip=path.join(output,githubAssetName(version,arch,{signed}));await fs.rm(zip,{force:true});
  await exec('/usr/bin/ditto',['-c','-k','--sequesterRsrc','--keepParent',bundle,zip]);
}
const inventory=await releaseInventory(output,{version,signed,commit:process.env.GITHUB_SHA});
await fs.writeFile(path.join(output,'release-info.json'),JSON.stringify(inventory,null,2)+'\n');
await fs.writeFile(path.join(output,'SHA256SUMS.txt'),inventory.assets.map(a=>`${a.sha256}  ${a.name}\n`).join(''));
let notes=await fs.readFile(path.join(root,'RELEASE-NOTES.txt'),'utf8');
notes+=signed ? '\nThese Mac downloads are Developer ID signed and notarized.\n' : '\nThese downloads require manual installation. This release is not offered for native automatic installation. See START-HERE.md in the repository for the launch steps.\n';
await fs.writeFile(path.join(output,'release-notes.md'),notes);
process.stdout.write('Both Mac archives and their checksums are ready to publish.\n');
