import * as fs from 'node:fs/promises';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {randomBytes} from 'node:crypto';

const names=['APPLE_CERTIFICATE_P12','APPLE_CERTIFICATE_PASSWORD','STUDY_TOOL_SIGN_IDENTITY','APPLE_API_KEY_P8','APPLE_API_KEY_ID','APPLE_API_ISSUER'];
const present=names.map(n=>!!process.env[n]);
if (present.some(Boolean) && !present.every(Boolean)) throw new Error('Supply all six Apple signing secrets, or leave all six unset for a manual-install release.');
if (!process.env.GITHUB_ENV || !process.env.RUNNER_TEMP) throw new Error('Run this helper in GitHub Actions.');
const append=values=>fs.appendFile(process.env.GITHUB_ENV,Object.entries(values).map(([key,value])=>{
  if (/[\r\n]/.test(value))throw new Error('A signing setting contains an invalid newline.');
  return `${key}=${value}\n`;
}).join(''));
if (!present.some(Boolean)) {
  if (process.env.REQUIRE_SIGNED_RELEASES === 'true') throw new Error('This repository requires signed releases. Configure Apple signing secrets before publishing.');
  await append({STUDY_TOOL_RELEASE_MODE:'manual'});
  process.stdout.write('No signing secrets configured: creating clearly labelled manual-install downloads.\n');
} else {
  if (process.platform !== 'darwin') throw new Error('Apple signing requires a Mac runner.');
  const exec=promisify(execFile);
  const run=async args=>{try{await exec('/usr/bin/security',args,{timeout:60000});}catch{throw new Error('Apple signing setup failed. Check the signing secrets and certificate.');}};
  const directory=await fs.mkdtemp(path.join(process.env.RUNNER_TEMP,'study-tool-signing-'));await fs.chmod(directory,0o700);
  const certificate=path.join(directory,'certificate.p12'),keychain=path.join(directory,'signing.keychain-db'),apiKey=path.join(directory,'AuthKey.p8');
  // Write the cleanup path before any signing command can fail.
  await append({STUDY_TOOL_SIGNING_DIRECTORY:directory,STUDY_TOOL_KEYCHAIN:keychain});
  await fs.writeFile(certificate,Buffer.from(process.env.APPLE_CERTIFICATE_P12,'base64'),{mode:0o600});
  await fs.writeFile(apiKey,Buffer.from(process.env.APPLE_API_KEY_P8,'base64'),{mode:0o600});
  const password=randomBytes(32).toString('hex');
  await run(['create-keychain','-p',password,keychain]);
  await run(['set-keychain-settings','-lut','21600',keychain]);
  await run(['unlock-keychain','-p',password,keychain]);
  await run(['import',certificate,'-P',process.env.APPLE_CERTIFICATE_PASSWORD,'-k',keychain,'-T','/usr/bin/codesign']);
  await run(['set-key-partition-list','-S','apple-tool:,apple:,codesign:','-s','-k',password,keychain]);
  await fs.rm(certificate,{force:true});
  await append({STUDY_TOOL_RELEASE_MODE:'signed',STUDY_TOOL_SIGN_IDENTITY:process.env.STUDY_TOOL_SIGN_IDENTITY,APPLE_API_KEY:apiKey,APPLE_API_KEY_ID:process.env.APPLE_API_KEY_ID,APPLE_API_ISSUER:process.env.APPLE_API_ISSUER});
  process.stdout.write('Temporary Apple signing keychain is ready.\n');
}
