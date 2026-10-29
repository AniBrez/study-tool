import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createRequire} from 'node:module';
import Module from 'node:module';

// Exercise the actual main process IPC/save/restart coordination with native Electron
// surfaces replaced by event emitters. No app installation is attempted by this test.
test('native update restart waits for renderer approval, file saves and a fresh retained checkpoint',async t=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'study-update-lifecycle-'));
  t.after(()=>fs.rm(dir,{recursive:true,force:true}));
  const handlers=new Map(),native=new EventEmitter(),app=new EventEmitter(),sent=[];
  let win,installed=0,dialogResponse=0;
  app.isPackaged=false;app.setName=()=>{};app.setPath=()=>{};app.getPath=()=>dir;app.getVersion=()=> '1.1.0';
  app.requestSingleInstanceLock=()=>true;app.whenReady=()=>Promise.resolve();app.quit=()=>{};
  class BrowserWindow extends EventEmitter {
    constructor(){super();win=this;this.webContents=new EventEmitter();this.webContents.send=(channel,...args)=>sent.push([channel,...args]);this.webContents.setWindowOpenHandler=()=>{};}
    loadURL(){} show(){} isMinimized(){return false;} focus(){} close(){const event={preventDefault(){this.canceled=true;}};this.emit('close',event);if(!event.canceled)this.emit('closed');}
  }
  native.quitAndInstall=()=>{installed++;};
  const electron={app,autoUpdater:native,BrowserWindow,Menu:{buildFromTemplate:x=>x,setApplicationMenu:()=>{}},dialog:{showErrorBox:()=>{},showMessageBox:async()=>({response:dialogResponse})},ipcMain:{handle:(c,h)=>handlers.set(c,h)},protocol:{registerSchemesAsPrivileged:()=>{},handle:()=>{}},shell:{showItemInFolder:()=>{}},session:{defaultSession:{webRequest:{onBeforeRequest:()=>{}},setPermissionRequestHandler:()=>{}}}};
  const require=createRequire(import.meta.url),originalLoad=Module._load;
  Module._load=function(request,parent,isMain){return request==='electron'?electron:originalLoad.call(this,request,parent,isMain);};
  try {require('../desktop/main.cjs');}finally{Module._load=originalLoad;}
  for(let i=0;i<100 && !handlers.has('updates:install');i++)await new Promise(r=>setTimeout(r,5));
  assert.ok(win);assert.ok(handlers.has('updates:install'));
  const event={sender:win.webContents,senderFrame:{url:'studytool://app/index.html'}};
  const invoke=(name,...args)=>handlers.get(name)(event,...args);
  const loaded=(await invoke('workspace:load')).value;
  const original=await fs.readFile(loaded.workspacePath,'utf8');
  native.emit('update-downloaded',{},'New release','1.2.0');
  await invoke('updates:install');assert.equal(installed,0);assert.equal(sent.at(-1)[0],'app:before-close');
  // A draft causes the native prompt; choosing Return must abort this restart.
  await invoke('app:close-ready',{draftPending:true});assert.equal(installed,0);assert.equal(await fs.readFile(loaded.workspacePath,'utf8'),original);
  // A fresh restart after saving must capture that newest data, not the download-time state.
  const next=structuredClone(loaded.workspace);next.topics[0].title='Latest topic before upgrade';
  next.topics[0].nodes.find(n=>n.type==='theorem').proof='Latest proof survives upgrade.';
  const pending=invoke('workspace:save',next);
  await invoke('updates:install');assert.equal(installed,0);
  await invoke('app:close-ready',{draftPending:false});await pending;assert.equal(installed,1);
  assert.deepEqual(JSON.parse(await fs.readFile(loaded.workspacePath,'utf8')),next);
  const backups=await fs.readdir(path.join(path.dirname(loaded.workspacePath),'update-backups'));
  assert.equal(backups.length,1);assert.deepEqual(JSON.parse(await fs.readFile(path.join(path.dirname(loaded.workspacePath),'update-backups',backups[0]),'utf8')),next);
  // Further install attempts with a forged sender never reach the native updater.
  const bad=await handlers.get('updates:install')({sender:{},senderFrame:{url:'https://untrusted.test/'}});
  assert.equal(bad.ok,false);assert.equal(installed,1);
});
