import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

test('sandbox bridge exposes only fixed operations and cloneable subscription results',async()=>{
  const events=new Map(),calls=[];let api;
  const electron={contextBridge:{exposeInMainWorld:(name,value)=>{assert.equal(name,'studyDesktop');api=value;}},ipcRenderer:{
    invoke:async(channel,...args)=>{calls.push({channel,args});return {ok:true,value:'done'};},
    on:(channel,listener)=>{events.set(channel,listener);return {notCloneable:()=>{}};}
  }};
  vm.runInNewContext(readFileSync(new URL('../desktop/preload.cjs',import.meta.url),'utf8'),{require:specifier=>{assert.equal(specifier,'electron');return electron;}});
  assert.equal(api.invoke,undefined);assert.equal(api.send,undefined);assert.equal(api.readFile,undefined);
  let close=false,action,state;
  assert.equal(api.onBeforeClose(()=>{close=true;}),undefined);
  assert.equal(api.onMenuAction(value=>{action=value;}),undefined);
  assert.equal(api.onUpdateState(value=>{state=value;}),undefined);
  events.get('app:before-close')();events.get('app:menu-action')({},'import');
  assert.equal(close,true);assert.equal(action,'import');
  events.get('updates:state')({}, {phase:'ready'});assert.equal(state.phase,'ready');
  await api.saveWorkspace({version:1,topics:[]});await api.confirmClose({draftPending:true});
  assert.equal(calls[0].channel,'workspace:save');assert.equal(calls[1].channel,'app:close-ready');
  await api.updateState();await api.configureUpdates({baseUrl:'https://updates.test'});await api.checkUpdates();await api.downloadUpdate();await api.openUpdateDownload();await api.installUpdate();
  assert.deepEqual(calls.slice(2).map(c=>c.channel),['updates:state','updates:configure','updates:check','updates:download','updates:open-download','updates:install']);
  electron.ipcRenderer.invoke=async()=>({ok:false,error:'Could not save'});
  await assert.rejects(api.saveWorkspace({}),/Could not save/);
});
