const { app, autoUpdater, BrowserWindow, Menu, dialog, ipcMain, protocol, shell, session } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');

app.setName('Study Tool');
app.setPath('userData', path.join(app.getPath('appData'), 'Study Tool'));
protocol.registerSchemesAsPrivileged([{scheme:'studytool',privileges:{standard:true,secure:true,supportFetchAPI:true,corsEnabled:true}}]);
if (!app.requestSingleInstanceLock()) {app.quit();process.exit(0);}

let win, store, updater, updateTimer, allowClose = false, closeRequested = false, quitRequested = false, installRequested = false;
const cancelClose = () => {closeRequested=false;quitRequested=false;installRequested=false;};
app.on('before-quit',()=>{quitRequested=true;});
const webRoot = path.join(__dirname,'..','dist');
const mime = {'.html':'text/html; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.woff2':'font/woff2','.woff':'font/woff','.ttf':'font/ttf','.png':'image/png'};
const csp = "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
const trusted = event => event.sender === win?.webContents && event.senderFrame?.url?.startsWith('studytool://app/');
function handle(channel, callback) {
  ipcMain.handle(channel,async (event,...args) => {
    if (!trusted(event)) return {ok:false,error:'This request did not come from Study Tool.'};
    try { return {ok:true,value:await callback(...args)}; }
    catch(error) { return {ok:false,error:error.message}; }
  });
}
async function saveCopy(value) {
  const {validateWorkspace} = await import('../dist/model.mjs');
  const valid = validateWorkspace(value);
  const result = await dialog.showSaveDialog(win,{title:'Export Study Tool workspace',defaultPath:path.join(app.getPath('documents'),`study-tool-${new Date().toISOString().slice(0,10)}.json`),filters:[{name:'Study Tool workspace',extensions:['json']}]});
  if(result.canceled || !result.filePath) return {canceled:true};
  const {atomicWrite} = await import('./storage.mjs');
  await atomicWrite(result.filePath,JSON.stringify(valid,null,2)+'\n');
  return {canceled:false,filePath:result.filePath};
}
async function finishClose() {
  try {
    await store.flush();
    // Squirrel also installs a downloaded update when the app next quits normally.
    if (updater?.downloaded) await updater.backupBeforeInstall();
    allowClose=true;
    if (installRequested) autoUpdater.quitAndInstall(); else win?.close();
  }
  catch(error) {
    allowClose=false;
    const updating = updater?.downloaded;
    const result=await dialog.showMessageBox(win,{type:'error',title:'Your latest changes have not been saved',message:updating ? 'The update has been paused to protect your work.' : 'Study Tool could not finish saving.',detail:`${error.message}\n\nRetry, save a separate copy, or return to the app.`,buttons:['Retry save','Save a copy…','Cancel',...(!updating ? ['Close without saving'] : [])],defaultId:0,cancelId:2,noLink:true});
    if(result.response===0) {
      try {await store.save(store.latestRequested);await finishClose();}
      catch {await finishClose();}
    } else if(result.response===1) {
      try {if(!(await saveCopy(store.latestRequested)).canceled && !updating){allowClose=true;win?.close();}else cancelClose();}
      catch(error){cancelClose();dialog.showErrorBox('Could not export',error.message);}
    } else if(result.response===3) {allowClose=true;win?.close();}
    else cancelClose();
  }
}
function makeWindow() {
  allowClose=false;closeRequested=false;
  win = new BrowserWindow({title:'Study Tool',width:1370,height:950,minWidth:760,minHeight:600,backgroundColor:'#ffffff',show:false,webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true}});
  win.webContents.setWindowOpenHandler(() => ({action:'deny'}));
  win.webContents.on('will-navigate',(event,url) => {if(!url.startsWith('studytool://app/'))event.preventDefault();});
  win.webContents.on('will-attach-webview',event => event.preventDefault());
  win.on('close',event => {
    if(allowClose) return;
    event.preventDefault();
    if(!closeRequested){closeRequested=true;win.webContents.send('app:before-close');}
  });
  win.on('closed',() => {win=null;if(quitRequested && !installRequested)app.quit();});
  win.once('ready-to-show',() => win.show());
  win.webContents.on('did-fail-load',(_event,code,description) => {
    if(code===-3)return;
    dialog.showErrorBox('Study Tool could not open',description);finishClose();
  });
  win.webContents.on('render-process-gone',() => {
    dialog.showErrorBox('Study Tool stopped unexpectedly','Your completed file saves remain on this computer. Reopen the app to continue.');finishClose();
  });
  win.loadURL('studytool://app/index.html');
}
app.on('second-instance',() => {if(win){if(win.isMinimized())win.restore();win.focus();}});
app.whenReady().then(async () => {
  const {WorkspaceStore}=await import('./storage.mjs');
  store=new WorkspaceStore(path.join(app.getPath('userData'),'workspace'));
  try {await store.load();}
  catch(error){
    const result=await dialog.showMessageBox({type:'error',title:'Could not read your workspace',message:error.message,detail:`Your files have not been reset.\n\n${store.directory}`,buttons:['Show files','Quit'],cancelId:1,noLink:true});
    if(result.response===0)await shell.openPath(store.directory);
    app.quit();return;
  }
  const {AppUpdater} = await import('./updater.mjs');
  updater = new AppUpdater({app, autoUpdater, store, directory:app.getPath('userData'), defaults:require('./release-config.json'), onChange:state=>win?.webContents.send('updates:state',state)});
  await updater.initialize();
  protocol.handle('studytool',async request => {
    try {
      const url=new URL(request.url);
      if(url.hostname!=='app' || request.method!=='GET')return new Response('Not found',{status:404});
      const file=path.resolve(webRoot,'.'+decodeURIComponent(url.pathname));
      const relative=path.relative(webRoot,file);
      if(relative.startsWith('..') || path.isAbsolute(relative))return new Response('Forbidden',{status:403});
      const body=await fs.readFile(file);
      return new Response(body,{headers:{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Content-Security-Policy':csp,'X-Content-Type-Options':'nosniff'}});
    }catch{return new Response('Not found',{status:404});}
  });
  // All application assets are local; prevent accidental outbound requests.
  session.defaultSession.webRequest.onBeforeRequest((details,callback) => callback({cancel:!details.url.startsWith('studytool://app/') && !details.url.startsWith('devtools://')}));
  session.defaultSession.setPermissionRequestHandler((_contents,_permission,callback)=>callback(false));
  handle('workspace:load',async()=>{await store.flush();return {workspace:store.current,notice:store.notice,workspacePath:store.file,backupPath:store.backups};});
  handle('workspace:save',value=>store.save(value));
  handle('workspace:show-files',()=>{shell.showItemInFolder(store.file);return null;});
  handle('workspace:export',saveCopy);
  handle('workspace:import',async()=>{
    const chosen=await dialog.showOpenDialog(win,{title:'Import Study Tool workspace',properties:['openFile'],filters:[{name:'Study Tool workspace',extensions:['json']}]});
    if(chosen.canceled || !chosen.filePaths.length)return null;
    const filename=chosen.filePaths[0],stat=await fs.stat(filename);
    if(stat.size>10*1024*1024)throw new Error('Choose a JSON file smaller than 10 MB.');
    const {validateWorkspace}=await import('../dist/model.mjs');
    return {workspace:validateWorkspace(JSON.parse(await fs.readFile(filename,'utf8'))),filename:path.basename(filename)};
  });
  handle('updates:state',()=>updater.getState());
  handle('updates:configure',settings=>updater.configure(settings));
  handle('updates:check',()=>updater.check());
  handle('updates:download',()=>updater.download());
  handle('updates:open-download',async()=>{await shell.openExternal(await updater.prepareManualDownload());return null;});
  handle('updates:install',()=>{
    if(!updater.downloaded)throw new Error('Download an update before installing it.');
    if(closeRequested)return null;
    installRequested=true;closeRequested=true;
    win.webContents.send('app:before-close');return null;
  });
  handle('app:close-ready',async options=>{
    if (!closeRequested) return null;
    if(options?.draftPending){
      const result=await dialog.showMessageBox(win,{type:'question',title:'Unsaved edits',message:'You have unsaved edits.',detail:'Return to the editor and save your changes to keep them.',buttons:['Return to editor',installRequested ? 'Discard unsaved edits and restart' : 'Discard unsaved edits and close'],defaultId:0,cancelId:0,noLink:true});
      if(result.response===0){cancelClose();return null;}
    }
    await finishClose();return null;
  });
  const action=name=>()=>win?.webContents.send('app:menu-action',name);
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(process.platform==='darwin'?[{label:'Study Tool',submenu:[{role:'about'},{label:'Settings…',accelerator:'CmdOrCtrl+,',click:action('settings')},{label:'Check for Updates…',click:action('updates')},{type:'separator'},{role:'services'},{type:'separator'},{role:'hide'},{role:'hideOthers'},{role:'unhide'},{type:'separator'},{role:'quit'}]}]:[]),
    {label:'File',submenu:[{label:'Save Card',accelerator:'CmdOrCtrl+S',click:action('save-card')},{label:'Import Workspace…',accelerator:'CmdOrCtrl+O',click:action('import')},{label:'Export Workspace…',accelerator:'CmdOrCtrl+Shift+S',click:action('export')},{label:'Show Saved Files',click:action('show-files')},{type:'separator'},{role:'close'}]},
    {label:'Edit',submenu:[{label:'Undo change',accelerator:'CmdOrCtrl+Z',click:action('undo')},{label:'Redo change',accelerator:'CmdOrCtrl+Shift+Z',click:action('redo')},{type:'separator'},{role:'cut'},{role:'copy'},{role:'paste'},{role:'selectAll'}]},
    {label:'View',submenu:[{role:'togglefullscreen'}]},
    {role:'windowMenu'},
    {label:'Help',submenu:[{label:'Study Tool Guide',click:action('help')},{label:'Check for Updates…',click:action('updates')}]}
  ]));
  makeWindow();
  const automaticCheck = () => {if(updater.getState().autoCheck && updater.getState().baseUrl)updater.check().catch(()=>{});};
  updateTimer = setInterval(automaticCheck,6*60*60*1000);updateTimer.unref();
  const initialCheck = setTimeout(automaticCheck,5000);initialCheck.unref();
  app.on('activate',()=>{if(!win)makeWindow();});
}).catch(error=>{dialog.showErrorBox('Study Tool could not start',error.message);app.quit();});
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit();});
