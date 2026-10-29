export function httpsAddress(value, {base = false} = {}) {
  if (typeof value !== 'string' || value.length > 2048) throw new Error('Enter a valid HTTPS update address.');
  let url;
  try { url = new URL(value.trim()); } catch { throw new Error('Enter a valid HTTPS update address.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.hash || (base && url.search)) throw new Error('Use an HTTPS update address without login details, a query, or a fragment.');
  return base ? url.href.replace(/\/+$/, '') : url.href;
}
export function newerVersion(a, b) {
  const parse = v => {
    if (typeof v !== 'string' || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(v)) throw new Error('The update feed contains an invalid version.');
    const parts = v.split('.').map(Number);
    if (parts.some(n => !Number.isSafeInteger(n))) throw new Error('The update feed contains an invalid version.');
    return parts;
  };
  const x = parse(a), y = parse(b);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i];
  return false;
}
export function updateSource(value) {
  const baseUrl = httpsAddress(value,{base:true}), url = new URL(baseUrl);
  if (url.hostname !== 'github.com') return {kind:'static',baseUrl};
  const match = url.pathname.match(/^\/([a-zA-Z0-9](?:[a-zA-Z0-9-]{0,38}))\/([a-zA-Z0-9_.-]+?)(?:\.git)?(?:\/releases(?:\/latest)?)?$/);
  if (!match || ['.','..'].includes(match[2])) throw new Error('Use the GitHub repository address, such as https://github.com/OWNER/REPOSITORY.');
  const [,owner,repo] = match;
  return {kind:'github',owner,repo,baseUrl:`https://github.com/${owner}/${repo}`,checkUrl:`https://api.github.com/repos/${owner}/${repo}/releases/latest`};
}
export function githubAssetName(version,arch,{signed = true} = {}) {
  newerVersion(version,'0.0.0');
  if (!['arm64','x64'].includes(arch)) throw new Error('Choose Apple Silicon or Intel.');
  // Only genuinely signed ZIPs use the names recognised by Electron's update service.
  return `Study-Tool-${version}-${signed ? 'darwin' : 'manual'}-${arch}.zip`;
}
export function readGitHubRelease(raw, installedVersion, source, arch) {
  if (source.kind !== 'github' || !raw || raw.draft !== false || raw.prerelease !== false || !Array.isArray(raw.assets) || raw.assets.length > 1000 || typeof raw.tag_name !== 'string') throw new Error('GitHub did not return a published stable release.');
  const version = raw.tag_name.replace(/^v/,'');
  const newer = newerVersion(version,installedVersion);
  const signedName = githubAssetName(version,arch), manualName = githubAssetName(version,arch,{signed:false});
  const asset = raw.assets.find(a=>a.name === signedName) || raw.assets.find(a=>a.name === manualName);
  if (!asset || asset.state !== 'uploaded' || !Number.isSafeInteger(asset.size) || asset.size <= 0 || asset.size > 2 * 1024 ** 3) throw new Error('This release has no completed download for your Mac.');
  const url = httpsAddress(asset.browser_download_url), parsed = new URL(url);
  const prefix = `/${source.owner}/${source.repo}/releases/download/${raw.tag_name}/`;
  if (parsed.origin !== 'https://github.com' || !parsed.pathname.startsWith(prefix) || decodeURIComponent(parsed.pathname.slice(prefix.length)) !== asset.name || parsed.search) throw new Error('The release download does not belong to the configured repository.');
  if (!/^sha256:[a-f0-9]{64}$/.test(asset.digest || '')) throw new Error('GitHub has not supplied a SHA-256 digest for this release.');
  return {version,url,notes:typeof raw.body === 'string' ? raw.body.slice(0,20000) : '',newer,nativeEligible:asset.name === signedName,sha256:asset.digest.slice(7),size:asset.size,kind:'github'};
}
export function githubNativeFeed(source, arch, installedVersion) {
  if (source.kind !== 'github') throw new Error('Choose a GitHub repository.');
  githubAssetName(installedVersion,arch);
  return `https://update.electronjs.org/${source.owner}/${source.repo}/darwin-${arch}/${installedVersion}`;
}
export function feedAddress(baseUrl, arch) {
  if (!['arm64', 'x64'].includes(arch)) throw new Error('This Mac architecture is not supported by the updater.');
  return `${httpsAddress(baseUrl, {base:true})}/darwin/${arch}/RELEASES.json`;
}
export function readRelease(raw, installedVersion, baseUrl) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.releases) || raw.releases.length > 200) throw new Error('The update address did not return a Study Tool release feed.');
  newerVersion(raw.currentRelease, installedVersion);
  const entry = raw.releases.find(r => r.version === raw.currentRelease)?.updateTo;
  if (!entry || entry.version !== raw.currentRelease) throw new Error('The latest release is missing from the update feed.');
  const url = httpsAddress(entry.url);
  // Downloads must remain on the release host selected by the app owner.
  if (new URL(url).origin !== new URL(baseUrl).origin) throw new Error('The download is outside the configured update host.');
  if (!Number.isSafeInteger(entry.size) || entry.size <= 0 || entry.size > 2 * 1024 ** 3 || !/^[a-f0-9]{64}$/.test(entry.sha256)) throw new Error('The update is missing a valid size or SHA-256 checksum.');
  if (typeof entry.notes !== 'string' || entry.notes.length > 20000) throw new Error('The release notes are invalid.');
  return {version:entry.version, url, notes:entry.notes, newer:newerVersion(entry.version, installedVersion)};
}
