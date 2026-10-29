import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {AppUpdater} from '../desktop/updater.mjs';
import {WorkspaceStore} from '../desktop/storage.mjs';
import {updateSource, readGitHubRelease, githubNativeFeed, githubAssetName} from '../desktop/update-feed.mjs';
import {releasePlan} from '../scripts/ci-release-plan.mjs';
import {releaseInventory, verifyPublishedAssets} from '../scripts/github-release-assets.mjs';

const repository = 'StudyToolTests/study-tool';
const source = updateSource(`https://github.com/${repository}`);
const version = '1.3.0';
const commit = 'a'.repeat(40);
function githubRelease({signed = true, version: releaseVersion = version} = {}) {
  return {
    tag_name: `v${releaseVersion}`, draft: false, prerelease: false, body: 'GitHub update integration.',
    assets: ['arm64', 'x64'].map(arch => {
      const name = githubAssetName(releaseVersion, arch, {signed});
      return {name, state: 'uploaded', size: 123, digest: `sha256:${'b'.repeat(64)}`,
        browser_download_url: `${source.baseUrl}/releases/download/v${releaseVersion}/${name}`};
    })
  };
}
async function fixture(t, {signed = false, release = githubRelease(), fetchImpl} = {}) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'study-github-'));
  t.after(() => fs.rm(directory, {recursive: true, force: true}));
  const store = new WorkspaceStore(path.join(directory, 'workspace'));
  await store.load();
  const native = new EventEmitter();
  let nativeChecks = 0;
  native.setFeedURL = feed => {native.feed = feed;};
  native.checkForUpdates = () => {nativeChecks++; native.emit('checking-for-update');};
  const requests = [];
  const updater = new AppUpdater({app: {getVersion: () => '1.2.0', isPackaged: true},
    autoUpdater: native, store, directory, platform: 'darwin', arch: 'arm64',
    defaults: {baseUrl: source.baseUrl, autoCheck: true}, signingCheck: async () => signed,
    fetchImpl: fetchImpl || (async (url, options) => {requests.push({url, options}); return new Response(JSON.stringify(release));})});
  await updater.initialize();
  return {updater, store, native, requests, directory, nativeChecks: () => nativeChecks};
}

test('GitHub repository and Releases URLs normalize to one unauthenticated API source', () => {
  for (const suffix of ['', '/', '.git', '/releases', '/releases/latest/']) {
    const parsed = updateSource(`${source.baseUrl}${suffix}`);
    assert.equal(parsed.baseUrl, source.baseUrl);
    assert.equal(parsed.checkUrl, `https://api.github.com/repos/${repository}/releases/latest`);
  }
  for (const url of [`${source.baseUrl}/tree/main`, `${source.baseUrl}?token=secret`,
    'http://github.com/StudyToolTests/study-tool', 'https://u:p@github.com/StudyToolTests/study-tool']) {
    assert.throws(() => updateSource(url));
  }
  assert.equal(updateSource('https://updates.example.test/releases').kind, 'static');
});

test('release parsing selects the exact architecture and rejects draft, preview and malformed versions', () => {
  for (const arch of ['arm64', 'x64']) {
    const parsed = readGitHubRelease(githubRelease(), '1.2.0', source, arch);
    assert.equal(parsed.newer, true); assert.equal(parsed.nativeEligible, true);
    assert.match(parsed.url, new RegExp(`darwin-${arch}\\.zip$`));
    assert.equal(parsed.sha256, 'b'.repeat(64));
  }
  assert.equal(readGitHubRelease(githubRelease(), version, source, 'arm64').newer, false);
  assert.equal(readGitHubRelease(githubRelease(), '2.0.0', source, 'arm64').newer, false);
  for (const change of [{draft: true}, {prerelease: true}, {tag_name: 'v01.3.0'}, {tag_name: 'v1.3.0-beta.1'}]) {
    assert.throws(() => readGitHubRelease({...githubRelease(), ...change}, '1.2.0', source, 'arm64'));
  }
});

test('release parsing rejects foreign downloads, missing hashes and incomplete assets', () => {
  for (const change of [{browser_download_url: 'https://other.example.test/app.zip'},
    {browser_download_url: `${source.baseUrl}/releases/download/v1.2.0/app.zip`},
    {browser_download_url: `${source.baseUrl}/releases/download/v1.3.0/other.zip`},
    {digest: null}, {digest: 'sha256:bad'}, {state: 'new'}, {size: 0}, {size: 3 * 1024 ** 3}]) {
    const raw = githubRelease(); Object.assign(raw.assets[0], change);
    assert.throws(() => readGitHubRelease(raw, '1.2.0', source, 'arm64'));
  }
  const raw = githubRelease(); raw.assets.shift();
  assert.throws(() => readGitHubRelease(raw, '1.2.0', source, 'arm64'), /no completed download/);
});

test('manual-install assets are never offered to the native updater, even in a signed app', async t => {
  const {updater, nativeChecks} = await fixture(t, {signed: true, release: githubRelease({signed: false})});
  assert.equal((await updater.check()).phase, 'manual');
  await assert.rejects(updater.download(), /manual installation/);
  assert.equal(nativeChecks(), 0);
  assert.match(updater.downloadAddress(), /manual-arm64\.zip$/);
});

test('unsigned installations discover GitHub releases without sending workspace data and retain manual-download checkpoints', async t => {
  const {updater, store, requests, nativeChecks} = await fixture(t);
  const pending = structuredClone(store.current); pending.topics[0].title = 'Latest local study notes';
  const save = store.save(pending);
  assert.equal((await updater.check()).phase, 'manual');
  await updater.prepareManualDownload(); await save;
  assert.equal(nativeChecks(), 0);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, source.checkUrl);
  assert.equal(requests[0].options.credentials, 'omit');
  assert.equal(requests[0].options.redirect, 'error');
  assert.equal(requests[0].options.body, undefined);
  const checkpoints = await fs.readdir(path.join(store.directory, 'update-backups'));
  assert.equal(checkpoints.length, 1);
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(store.directory, 'update-backups', checkpoints[0]), 'utf8')), pending);
  assert.deepEqual((await new WorkspaceStore(store.directory).load()).workspace, pending);
});

test('failed checkpoints block manual downloads and preserve the existing workspace', async t => {
  const {updater, store} = await fixture(t); await updater.check();
  const saved = await fs.readFile(store.file, 'utf8');
  store.checkpoint = async () => {throw new Error('Disk full');};
  await assert.rejects(updater.prepareManualDownload(), /Disk full/);
  assert.equal(await fs.readFile(store.file, 'utf8'), saved);
});

test('signed GitHub updates use Electron native feed after pending saves and a retained checkpoint', async t => {
  const {updater, store, native, nativeChecks} = await fixture(t, {signed: true});
  assert.equal((await updater.check()).phase, 'available');
  await updater.download();
  assert.equal(nativeChecks(), 1);
  assert.deepEqual(native.feed, {url: githubNativeFeed(source, 'arm64', '1.2.0'), serverType: 'default'});
  assert.equal(native.feed.url, `https://update.electronjs.org/${repository}/darwin-arm64/1.2.0`);
  assert.equal((await fs.readdir(path.join(store.directory, 'update-backups'))).length, 1);
  native.emit('update-downloaded', {}, 'GitHub release', version);
  assert.equal(updater.getState().phase, 'ready');
  await updater.backupBeforeInstall();
});

test('missing GitHub releases, rate limits and excessive metadata do not overwrite the workspace or report success', async t => {
  for (const response of [new Response('Not found', {status: 404}),
    new Response('Rate limit', {status: 403}), new Response('x'.repeat(1024 * 1024 + 1))]) {
    const {updater, store} = await fixture(t, {fetchImpl: async () => response});
    const before = await fs.readFile(store.file, 'utf8');
    const result = await updater.check(); assert.equal(result.phase, 'error');
    if (response.status === 404) assert.match(result.message, /No public release/);
    assert.equal(await fs.readFile(store.file, 'utf8'), before);
    assert.throws(() => updater.downloadAddress());
  }
});

test('release planning enforces an exact version tag, public repository and safe manual-release branch', () => {
  const args = {version, repository, visibility: 'public', ref: `refs/tags/v${version}`, event: 'push', defaultBranch: 'main'};
  assert.deepEqual(releasePlan(args), {tag: `v${version}`, version, baseUrl: source.baseUrl, autoCheck: true});
  assert.equal(releasePlan({...args, event: 'workflow_dispatch', ref: 'refs/heads/main'}).tag, `v${version}`);
  assert.equal(releasePlan({...args, ref: 'refs/heads/main'}).tag, `v${version}`);
  for (const change of [{visibility: 'private'}, {ref: 'refs/tags/v1.2.0'}, {repository: `${repository}/releases`},
    {event: 'pull_request'}, {event: 'workflow_dispatch', ref: 'refs/heads/other'}]) {
    assert.throws(() => releasePlan({...args, ...change}));
  }
});

test('release inventory requires both architectures and publication verifies their exact uploaded digests', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'study-inventory-'));
  t.after(() => fs.rm(directory, {recursive: true, force: true}));
  const args = {version, signed: false, commit};
  const first = githubAssetName(version, 'arm64', {signed: false});
  await fs.writeFile(path.join(directory, first), 'Apple Silicon archive fixture');
  await assert.rejects(releaseInventory(directory, args));
  await fs.writeFile(path.join(directory, githubAssetName(version, 'x64', {signed: false})), 'Intel archive fixture');
  const inventory = await releaseInventory(directory, args);
  assert.equal(inventory.assets[0].sha256, createHash('sha256').update('Apple Silicon archive fixture').digest('hex'));
  const raw = {tag_name: `v${version}`, target_commitish: commit, draft: true, prerelease: false,
    assets: inventory.assets.map(a => ({...a, state: 'uploaded', digest: `sha256:${a.sha256}`}))};
  assert.doesNotThrow(() => verifyPublishedAssets(inventory, raw));
  for (const change of [{draft: false}, {prerelease: true}, {target_commitish: 'b'.repeat(40)}, {assets: raw.assets.slice(1)}]) {
    assert.throws(() => verifyPublishedAssets(inventory, {...raw, ...change}));
  }
  raw.assets[0].digest = `sha256:${'c'.repeat(64)}`;
  assert.throws(() => verifyPublishedAssets(inventory, raw), /checksum/);
});
