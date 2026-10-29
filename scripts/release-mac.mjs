import * as fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { createUpdateFeed } from './create-update-feed.mjs';
const exec = promisify(execFile);
const root = fileURLToPath(new URL('..',import.meta.url));
if (process.platform !== 'darwin') throw new Error('Signed Mac releases must be built on macOS.');
if (!process.env.STUDY_TOOL_SIGN_IDENTITY) throw new Error('Set STUDY_TOOL_SIGN_IDENTITY to your Developer ID Application identity.');
if (!process.env.APPLE_API_KEY || !process.env.APPLE_API_KEY_ID || !process.env.APPLE_API_ISSUER) throw new Error('Set the three Apple notarization API credentials described in UPDATES.md.');
const {baseUrl} = JSON.parse(await fs.readFile(path.join(root,'desktop/release-config.json'),'utf8'));
if (!baseUrl) throw new Error('Configure the HTTPS update address before building a release.');
const {version} = JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8'));
const notes = await fs.readFile(path.join(root,'RELEASE-NOTES.txt'),'utf8');
const output = path.join(root,'out','update-host');
await exec(process.execPath,[path.join(root,'node_modules/@electron-forge/cli/dist/electron-forge.js'),'package','--platform=darwin','--arch=arm64,x64'],{cwd:root,maxBuffer:8*1024*1024});
for (const arch of ['arm64','x64']) {
  const bundle = path.join(root,'out',`Study Tool-darwin-${arch}`,'Study Tool.app');
  await exec('/usr/bin/codesign',['--verify','--deep','--strict',bundle]);
  const {stderr} = await exec('/usr/bin/codesign',['--display','--verbose=2',bundle]);
  if (!/^Authority=Developer ID Application:/m.test(stderr)) throw new Error('The release is not Developer ID signed.');
  await exec('/usr/sbin/spctl',['--assess','--type','execute','--verbose=2',bundle]);
  const zip = path.join(root,'out',`Study-Tool-${version}-${arch}.zip`);
  await fs.rm(zip,{force:true});
  await exec('/usr/bin/ditto',['-c','-k','--sequesterRsrc','--keepParent',bundle,zip]);
  await createUpdateFeed({baseUrl,arch,zip,output,version,notes});
}
process.stdout.write('Signed release files are ready in out/update-host. Publish ZIPs before RELEASES.json.\n');
