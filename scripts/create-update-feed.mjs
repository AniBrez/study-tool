import * as fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { httpsAddress } from '../desktop/update-feed.mjs';

export async function createUpdateFeed({baseUrl, arch, zip, output, version, notes = ''}) {
  baseUrl = httpsAddress(baseUrl, {base:true});
  if (!['arm64','x64'].includes(arch) || !/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Choose a valid Mac architecture and release version.');
  const stat = await fs.stat(zip);
  if (!stat.isFile() || !stat.size) throw new Error('The update ZIP is missing or empty.');
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(zip)) hash.update(chunk);
  const folder = path.join(output,'darwin',arch), filename = `Study-Tool-${version}-${arch}.zip`;
  await fs.mkdir(folder,{recursive:true});
  if (path.resolve(zip) !== path.resolve(folder,filename)) await fs.copyFile(zip,path.join(folder,filename));
  const manifest = {currentRelease:version,releases:[{version,updateTo:{version,name:`Study Tool ${version}`,pub_date:new Date().toISOString(),notes,url:`${baseUrl}/darwin/${arch}/${filename}`,sha256:hash.digest('hex'),size:stat.size}}]};
  await fs.writeFile(path.join(folder,'RELEASES.json'),JSON.stringify(manifest,null,2)+'\n');
  return manifest;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [baseUrl, arch, zip, output] = process.argv.slice(2);
  if (!output) throw new Error('Usage: node scripts/create-update-feed.mjs <https-base-url> <arm64|x64> <zip> <output-directory>');
  const {version} = JSON.parse(await fs.readFile(new URL('../package.json',import.meta.url),'utf8'));
  const notes = await fs.readFile(new URL('../RELEASE-NOTES.txt',import.meta.url),'utf8');
  await createUpdateFeed({baseUrl,arch,zip,output,version,notes});
  process.stdout.write(`Release feed created for ${arch}.\n`);
}
