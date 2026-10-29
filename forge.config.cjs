const path = require('node:path');
const signingIdentity = process.env.STUDY_TOOL_SIGN_IDENTITY;
const notarization = [process.env.APPLE_API_KEY,process.env.APPLE_API_KEY_ID,process.env.APPLE_API_ISSUER];
if (notarization.some(Boolean) && (!signingIdentity || !notarization.every(Boolean))) throw new Error('Mac release signing needs an identity and all three notarization API settings.');
module.exports = {
  packagerConfig: {
    name: 'Study Tool', executableName: 'Study Tool', appBundleId: 'local.studytool.desktop',
    appCategoryType: 'public.app-category.education', appCopyright: 'Study Tool',
    icon: './assets/study-tool', asar: true,
    ignore: [/^\/tests($|\/)/,/^\/scripts($|\/)/,/^\/out($|\/)/,/^\/\.openai($|\/)/,/^\/\.git($|\/)/,/^\/\.github($|\/)/,/^\/(START-HERE|UPDATES|VALIDATION)\.md$/],
    darwinDarkModeSupport: false,
    ...(signingIdentity ? {osxSign:{identity:signingIdentity,...(process.env.STUDY_TOOL_KEYCHAIN ? {keychain:process.env.STUDY_TOOL_KEYCHAIN} : {}),hardenedRuntime:true,optionsForFile:()=>({entitlements:path.join(__dirname,'desktop','entitlements.mac.plist')})}} : {}),
    ...(notarization.every(Boolean) ? {osxNotarize:{appleApiKey:notarization[0],appleApiKeyId:notarization[1],appleApiIssuer:notarization[2]}} : {})
  },
  makers: [
    {name:'@electron-forge/maker-zip',platforms:['darwin','linux','win32']},
    {name:'@electron-forge/maker-dmg',platforms:['darwin'],config:{format:'ULFO'}}
  ]
};
