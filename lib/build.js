const packager = require('electron-packager');
const electronInstaller = require('electron-winstaller');
const fs = require('fs');
const package = require('../src/package.json');
const setting = require('./setting.json');
const sourceDir = 'src';
const buildDir = 'build';
const releaseDir = 'release';
packager({
  name: package['name'],
  dir: `./${sourceDir}`,
  out: `./${buildDir}`,
  icon: `./${sourceDir}/images/icon.ico`,
  platform: 'win32',
  arch: 'ia32',
  version: '1.7.10', // Electronのバージョン
  overwrite: true, // 上書き
  asar: false, // asarパッケージ化
  'app-version': package['version'],
  'app-copyright': `(C) 2017 ${package['author']}`,
  // Windowsのみのオプション
  'version-string': {
    CompanyName: 'prfac.com',
    FileDescription: package['name'],
    OriginalFilename: `${package['name']}.exe`,
    ProductName: package['name'],
    InternalName: package['name']
  }
},
// 完了時のコールバック
function(err, appPaths) {
  console.log(`Create: ${appPaths}`);
  if (err) console.log(err);
  resultPromise = electronInstaller.createWindowsInstaller({
    appDirectory: `./${buildDir}/DiSpeak-win32-ia32`,
    outputDirectory: `./${releaseDir}`,
    loadingGif: './src/images/loading.gif',
    authors: package['author'],
    exe: `${package['name']}.exe`,
    description: package['description'],
    iconUrl: 'https://prfac.com/dispeak/icon.ico',
    setupIcon: './src/images/icon.ico',
    setupExe: `DiSpeakSetup.exe`,
    noMsi: true
  });
  resultPromise.then(() => {
    console.log("It worked!");
  }, (e) => {
    console.log(`No dice: ${e.message}`);
  });
});