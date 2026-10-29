import * as fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { validateWorkspace, seedWorkspace, clone, SCHEMA_VERSION } from '../dist/model.mjs';

export async function atomicWrite(filename, text) {
  await fs.mkdir(path.dirname(filename), { recursive: true, mode: 0o700 });
  const temporary = `${filename}.${randomUUID()}.tmp`;
  let handle;
  try {
    handle = await fs.open(temporary, 'wx', 0o600);
    await handle.writeFile(text, 'utf8');
    await handle.sync();
    await handle.close(); handle = null;
    await fs.rename(temporary, filename);
  } finally {
    await handle?.close().catch(() => {});
    await fs.unlink(temporary).catch(() => {});
  }
}
const encode = value => JSON.stringify(value, null, 2) + '\n';
const stamp = () => new Date().toISOString().replace(/[:.]/g, '-');

export class WorkspaceStore {
  constructor(directory, { keepBackups = 40 } = {}) {
    this.directory = directory;
    this.file = path.join(directory, 'workspace.json');
    this.backups = path.join(directory, 'backups');
    this.keepBackups = keepBackups;
    this.current = null;
    this.latestRequested = null;
    this.queue = Promise.resolve();
    this.lastError = null;
    this.notice = '';
  }
  async load() {
    await fs.mkdir(this.backups, {recursive:true, mode:0o700});
    let original = null, missing = false;
    try { original = await fs.readFile(this.file, 'utf8'); }
    catch(error) { if(error.code === 'ENOENT') missing = true; else throw error; }
    if (!missing) {
      let raw;
      try { raw = JSON.parse(original); } catch { /* Recovery below handles malformed JSON. */ }
      if (Number.isInteger(raw?.version) && raw.version > SCHEMA_VERSION) throw new Error('This workspace was saved by a newer Study Tool. Install the newer app to open it. Your files have been preserved.');
      try { this.current = validateWorkspace(raw); }
      catch { /* Try known-good backups before allowing any further writes. */ }
      if (this.current && raw.version === 1) {
        const digest = createHash('sha256').update(original).digest('hex').slice(0,16);
        const migrationFile = path.join(this.directory,'migration-backups',`workspace-v1-${digest}.json`);
        try {await fs.access(migrationFile);} catch(error) {if(error.code !== 'ENOENT')throw error;await atomicWrite(migrationFile,original);}
      }
    }
    if (!this.current) {
      const names = (await fs.readdir(this.backups)).filter(n => /^workspace-.*\.json$/.test(n)).sort().reverse();
      for (const name of names) {
        try {
          const recovered = validateWorkspace(JSON.parse(await fs.readFile(path.join(this.backups,name),'utf8')));
          if (original !== null) await atomicWrite(path.join(this.directory,`workspace-unreadable-${stamp()}-${randomUUID()}.json`),original);
          await atomicWrite(this.file,encode(recovered));
          this.current = recovered;
          this.notice = original !== null ? 'Recovered your workspace from an automatic backup. The original file has been preserved.' : 'Recovered your missing workspace from an automatic backup.';
          break;
        } catch(error) {
          if (error.code && error.code !== 'ENOENT') throw error;
        }
      }
      if (!this.current && !missing) throw new Error('The workspace file could not be read and no usable automatic backup was found. Your existing files have been preserved.');
      if (!this.current) {
        this.current = seedWorkspace();
        await atomicWrite(this.file,encode(this.current));
      }
    }
    this.latestRequested = clone(this.current);
    return {workspace:clone(this.current),notice:this.notice,workspacePath:this.file,backupPath:this.backups};
  }
  async save(value) {
    const valid = validateWorkspace(value);
    if (!this.current) throw new Error('The workspace has not been opened.');
    this.latestRequested = clone(valid);
    const operation = this.queue.then(async () => {
      const backup = `workspace-${stamp()}-${randomUUID()}.json`;
      // Keep the last complete workspace before atomically replacing it.
      await atomicWrite(path.join(this.backups,backup),encode(this.current));
      await atomicWrite(this.file,encode(valid));
      this.current = clone(valid);
      this.lastError = null;
      const names = (await fs.readdir(this.backups)).filter(n => /^workspace-.*\.json$/.test(n)).sort().reverse();
      await Promise.all(names.slice(this.keepBackups).map(name => fs.unlink(path.join(this.backups,name)).catch(() => {})));
      return {savedAt:new Date().toISOString(),workspacePath:this.file};
    });
    this.queue = operation.catch(error => {this.lastError = error;});
    return operation;
  }
  async flush() { await this.queue; if(this.lastError) throw this.lastError; }
  async checkpoint(version) {
    if (!/^[0-9]+\.[0-9]+\.[0-9]+$/.test(version)) throw new Error('Invalid backup version.');
    // Serialize with ordinary saves. Update checkpoints are never pruned with the rolling backups.
    const operation = this.queue.then(async () => {
      if (this.lastError) throw this.lastError;
      if (!this.current) throw new Error('The workspace has not been opened.');
      const file = path.join(this.directory, 'update-backups', `before-${version}-${stamp()}-${randomUUID()}.json`);
      await atomicWrite(file, encode(this.current));
      return file;
    });
    this.queue = operation.catch(() => {});
    return operation;
  }
}
