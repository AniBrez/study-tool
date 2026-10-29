import * as fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {updateSource,newerVersion} from '../desktop/update-feed.mjs';

export function releasePlan({version,repository,visibility,ref,event,defaultBranch}) {
  newerVersion(version,'0.0.0');
  const source=updateSource(`https://github.com/${repository}`);
  if (source.kind !== 'github' || source.baseUrl !== `https://github.com/${repository}`) throw new Error('Choose a GitHub repository in OWNER/REPOSITORY form.');
  if (visibility !== 'public') throw new Error('This updater uses public GitHub releases. Confirm repository visibility before releasing; no files were published.');
  const tag=`v${version}`;
  const defaultBranchRef=defaultBranch ? `refs/heads/${defaultBranch}` : null;
  if (event === 'push' ? ref !== `refs/tags/${tag}` && ref !== defaultBranchRef : event !== 'workflow_dispatch' || ref !== defaultBranchRef) throw new Error('Release tags must match package.json, and branch/manual releases must run on the default branch.');
  return {tag,version,baseUrl:source.baseUrl,autoCheck:true};
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const {version}=JSON.parse(await fs.readFile(new URL('../package.json',import.meta.url),'utf8'));
  const plan=releasePlan({version,repository:process.env.GITHUB_REPOSITORY,visibility:process.env.REPOSITORY_VISIBILITY,ref:process.env.GITHUB_REF,event:process.env.GITHUB_EVENT_NAME,defaultBranch:process.env.REPOSITORY_DEFAULT_BRANCH});
  await fs.writeFile(new URL('../desktop/release-config.json',import.meta.url),JSON.stringify({baseUrl:plan.baseUrl,autoCheck:true},null,2)+'\n');
  process.stdout.write(`Release ${plan.tag} will use the current repository as its update source.\n`);
}
