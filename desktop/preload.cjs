const { contextBridge, ipcRenderer } = require('electron');
const invoke = async (channel, ...args) => {
  const response = await ipcRenderer.invoke(channel, ...args);
  if (!response.ok) throw new Error(response.error || 'The operation could not complete.');
  return response.value;
};
contextBridge.exposeInMainWorld('studyDesktop', Object.freeze({
  loadWorkspace: () => invoke('workspace:load'),
  saveWorkspace: data => invoke('workspace:save', data),
  exportWorkspace: data => invoke('workspace:export', data),
  pickImport: () => invoke('workspace:import'),
  showFiles: () => invoke('workspace:show-files'),
  updateState: () => invoke('updates:state'),
  configureUpdates: settings => invoke('updates:configure',settings),
  checkUpdates: () => invoke('updates:check'),
  downloadUpdate: () => invoke('updates:download'),
  openUpdateDownload: () => invoke('updates:open-download'),
  installUpdate: () => invoke('updates:install'),
  onUpdateState: callback => {ipcRenderer.on('updates:state', (_event,state) => callback(state));},
  confirmClose: options => invoke('app:close-ready',options),
  onBeforeClose: callback => {ipcRenderer.on('app:before-close', () => callback());},
  onMenuAction: callback => {ipcRenderer.on('app:menu-action', (_event,action) => callback(action));}
}));
