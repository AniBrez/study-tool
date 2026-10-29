import * as fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { atomicWrite } from './storage.mjs';
import { httpsAddress, feedAddress, readRelease, updateSource, readGitHubRelease, githubNativeFeed } from './update-feed.mjs';

const exec = promisify(execFile);
export async function supportsMacUpdates(app, platform = process.platform) {
  if (platform !== 'darwin' || !app.isPackaged) return false;
  try {
    const bundle = path.resolve(app.getAppPath(), '..', '..', '..');
    await exec('/usr/bin/codesign', ['--verify', '--deep', '--strict', bundle], {timeout:15000});
    const details = await exec('/usr/bin/codesign', ['--display', '--verbose=2', bundle], {timeout:15000});
    return /^Authority=Developer ID Application:/m.test(details.stderr) && /^TeamIdentifier=[A-Z0-9]+$/m.test(details.stderr);
  } catch { return false; }
}
async function downloadFeed(url, fetchImpl) {
  const response = await fetchImpl(url, {redirect:'error', credentials:'omit', cache:'no-store', signal:AbortSignal.timeout(30000), headers:{Accept:'application/json','User-Agent':'Study-Tool-Updater'}});
  if (!response.ok) {
    if (response.status === 404 && new URL(url).hostname === 'api.github.com') throw new Error('No public release was found. The repository must be public and have a published stable release.');
    throw new Error(`The update host returned HTTP ${response.status}. Try again later.`);
  }
  if (Number(response.headers.get('content-length')) > 1024 * 1024) throw new Error('The update feed is too large.');
  const reader = response.body.getReader(); let total = 0; const chunks = [];
  try {
    while (true) {
      const {done, value} = await reader.read(); if (done) break;
      total += value.length;
      if (total > 1024 * 1024) throw new Error('The update feed is too large.');
      chunks.push(Buffer.from(value));
    }
  } finally { await reader.cancel().catch(() => {}); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new Error('The update address returned a page instead of a release feed. Check the address and host access.'); }
}

export class AppUpdater {
  constructor({app, autoUpdater, store, directory, defaults = {}, platform = process.platform, arch = process.arch, fetchImpl = globalThis.fetch, signingCheck = supportsMacUpdates, onChange = () => {}}) {
    Object.assign(this, {app, autoUpdater, store, directory, platform, arch, fetchImpl, signingCheck, onChange});
    this.file = path.join(directory, 'update-settings.json');
    this.settings = {baseUrl:defaults.baseUrl || '', autoCheck:defaults.autoCheck === true};
    this.state = {phase:'setup', version:app.getVersion(), availableVersion:'', notes:'', message:'Online updates have not been connected yet.', signed:false};
    this.release = null; this.busy = false; this.downloaded = false; this.checkPromise = null;
    autoUpdater.on('error', error => {this.busy = false; this.publish({phase:'error', message:`Could not update: ${error.message}. Your flowcharts have not been changed.`});});
    autoUpdater.on('checking-for-update', () => this.publish({phase:'downloading', message:'Downloading the update. You can keep studying.'}));
    autoUpdater.on('update-available', () => this.publish({phase:'downloading', message:'Downloading the update. You can keep studying.'}));
    autoUpdater.on('update-not-available', () => {this.busy = false; this.publish(this.release?.newer ? {phase:'available',message:'The release service is not ready for this version yet. Try downloading again shortly.'} : {phase:'current',message:'You have the latest version.'});});
    autoUpdater.on('update-downloaded', (_event, notes, name) => {
      this.busy = false; this.downloaded = true;
      this.publish({phase:'ready', message:'The update is ready. Save any open card, then restart to install it.', notes:typeof notes === 'string' ? notes.slice(0,20000) : this.state.notes});
    });
  }
  getState() { return {...this.state, ...this.settings}; }
  publish(next) { Object.assign(this.state, next); this.onChange(this.getState()); return this.getState(); }
  async initialize() {
    let notice = '';
    try {
      const raw = JSON.parse(await fs.readFile(this.file, 'utf8'));
      this.settings = {baseUrl:raw.baseUrl ? updateSource(raw.baseUrl).baseUrl : '', autoCheck:raw.autoCheck === true};
    } catch (error) { if (error.code !== 'ENOENT') notice = 'The update settings could not be read. Set the update address again. Your workspace is unaffected.'; }
    this.settings.baseUrl = this.settings.baseUrl ? updateSource(this.settings.baseUrl).baseUrl : '';
    const signed = await this.signingCheck(this.app, this.platform);
    const supported = this.platform === 'darwin' && ['arm64','x64'].includes(this.arch);
    return this.publish({signed, phase:!supported ? 'unsupported' : this.settings.baseUrl ? 'idle' : 'setup', message:notice || (!supported ? 'Automatic updates are available in the Mac edition.' : this.settings.baseUrl ? 'Choose Check for updates when you are online.' : 'Online updates have not been connected yet. Set the update address supplied with a release.')});
  }
  async configure(raw) {
    if (this.busy || this.downloaded || this.checkPromise) throw new Error('Finish the current update before changing its source.');
    const settings = {baseUrl:raw?.baseUrl ? updateSource(raw.baseUrl).baseUrl : '', autoCheck:raw?.autoCheck === true};
    await atomicWrite(this.file, JSON.stringify(settings, null, 2) + '\n');
    this.settings = settings; this.release = null;
    return this.publish({phase:settings.baseUrl ? 'idle' : 'setup', availableVersion:'', notes:'', message:settings.baseUrl ? 'Update address saved. You can now check for releases.' : 'Online updates are off. Your flowcharts still save on this computer.'});
  }
  check() {
    if (this.busy || this.downloaded) return Promise.resolve(this.getState());
    if (this.checkPromise) return this.checkPromise;
    this.checkPromise = this.checkOnce().finally(() => {this.checkPromise = null;});
    return this.checkPromise;
  }
  async checkOnce() {
    if (this.platform !== 'darwin') return this.getState();
    if (!this.settings.baseUrl) return this.publish({phase:'setup', message:'Set an update address before checking for releases.'});
    this.release = null; this.publish({phase:'checking', availableVersion:'', notes:'', message:'Checking for updates…'});
    try {
      const source = updateSource(this.settings.baseUrl);
      const raw = await downloadFeed(source.kind === 'github' ? source.checkUrl : feedAddress(source.baseUrl, this.arch), this.fetchImpl);
      const release = source.kind === 'github' ? readGitHubRelease(raw,this.app.getVersion(),source,this.arch) : readRelease(raw, this.app.getVersion(), this.settings.baseUrl);
      this.release = release;
      const automatic = this.state.signed && release.nativeEligible !== false;
      return this.publish({phase:release.newer ? automatic ? 'available' : 'manual' : 'current', availableVersion:release.newer ? release.version : '', notes:release.notes, message:release.newer ? automatic ? `Version ${release.version} is available.` : `Version ${release.version} is available to download for manual installation.` : 'You have the latest version.'});
    } catch (error) { return this.publish({phase:'error', message:`Could not check for updates. ${error.message} Your flowcharts have not been changed.`}); }
  }
  async download() {
    if (this.busy || this.downloaded) return this.getState();
    if (!this.release?.newer || !this.state.signed || this.release.nativeEligible === false || this.platform !== 'darwin') throw new Error('This edition needs manual installation. Use Download for manual installation.');
    this.busy = true;
    try {
      // Native Mac updates may install on the next quit, so checkpoint before allowing a download.
      await this.store.flush();
      await this.store.checkpoint(this.app.getVersion());
      const source = updateSource(this.settings.baseUrl);
      this.autoUpdater.setFeedURL(source.kind === 'github' ? {url:githubNativeFeed(source,this.arch,this.app.getVersion()),serverType:'default'} : {url:feedAddress(this.settings.baseUrl, this.arch), serverType:'json'});
      this.publish({phase:'downloading', message:'Downloading the update. You can keep studying.'});
      this.autoUpdater.checkForUpdates();
      return this.getState();
    } catch (error) { this.busy = false; this.publish({phase:'error', message:`The update did not start. ${error.message}`}); throw error; }
  }
  async backupBeforeInstall() {
    if (!this.downloaded) throw new Error('Download an update before installing it.');
    await this.store.flush();
    return this.store.checkpoint(this.app.getVersion());
  }
  async prepareManualDownload() {
    const address = this.downloadAddress();
    await this.store.flush();
    await this.store.checkpoint(this.app.getVersion());
    return address;
  }
  downloadAddress() {
    if (!this.release?.newer) throw new Error('Check for an update before downloading it.');
    return httpsAddress(this.release.url);
  }
}
