import * as fs from 'node:fs/promises';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const directory=process.env.STUDY_TOOL_SIGNING_DIRECTORY;
if (directory) {
  const relative=path.relative(process.env.RUNNER_TEMP || '',directory);
  if (!relative.startsWith('study-tool-signing-') || relative.includes(path.sep) || relative.includes('..'))throw new Error('Unexpected signing cleanup path.');
  if(process.platform === 'darwin')await promisify(execFile)('/usr/bin/security',['delete-keychain',path.join(directory,'signing.keychain-db')]).catch(()=>{});
  await fs.rm(directory,{recursive:true,force:true});
}
