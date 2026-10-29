import * as fs from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {githubAssetName,newerVersion} from '../desktop/update-feed.mjs';

export async function releaseInventory(directory,{version,signed,commit}) {
  newerVersion(version,'0.0.0');
  if (typeof signed !== 'boolean' || !/^[a-f0-9]{40}$/.test(commit)) throw new Error('A release needs a signing mode and exact source commit.');
  const assets=[];
  for(const arch of ['arm64','x64']){
    const name=githubAssetName(version,arch,{signed}),file=path.join(directory,name),stat=await fs.stat(file);
    if(!stat.isFile() || stat.size <= 0)throw new Error(`Missing ${arch} release archive.`);
    const hash=createHash('sha256');for await(const chunk of createReadStream(file))hash.update(chunk);
    assets.push({arch,name,size:stat.size,sha256:hash.digest('hex')});
  }
  return {version,signed,commit,workspaceSchema:2,assets};
}
export function verifyPublishedAssets(inventory,raw) {
  if (raw?.draft !== true || raw.prerelease !== false || raw.tag_name !== `v${inventory.version}` || raw.target_commitish !== inventory.commit || !Array.isArray(raw.assets)) throw new Error('The release draft does not match the built commit.');
  for(const expected of inventory.assets){
    const asset=raw.assets.find(a=>a.name===expected.name);
    if(!asset || asset.state !== 'uploaded' || asset.size !== expected.size || asset.digest !== `sha256:${expected.sha256}`)throw new Error(`GitHub has not confirmed the checksum of ${expected.name}. The release stays a draft.`);
  }
}
