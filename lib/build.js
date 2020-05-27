const packager = require('electron-packager');
const electronInstaller = require('electron-winstaller');
const fs = require('fs-extra');
const srcPackage = require('../src/package.json');
const bldPackage = require('../package.json');
const sourceDir = 'src';
const buildDir = 'build';
const releaseDir = 'release';
const rimrafOptions = {};
const packagerOptions = {
  name: srcPackage['name'],
  dir: `./${sourceDir}`,
  out: `./${buildDir}`,
  icon: `./${sourceDir}/images/icon.ico`,
  platform: 'win32',
  arch: 'ia32',
  electronVersion: bldPackage.devDependencies.electron.replace(/\^/, ''), // Electronのバージョン
  overwrite: true, // 上書き
  asar: false, // asarパッケージ化
  appVersion: srcPackage['version'],
  appCopyright: `(C) 2017 ${srcPackage['author']}`,
  // Windowsのみのオプション
  win32metadata: {
    CompanyName: 'prfac.com',
    FileDescription: srcPackage['description'],
    OriginalFilename: `${srcPackage['name']}.exe`,
    ProductName: srcPackage['name'],
    InternalName: srcPackage['name']
  }
};
const installerOptions = {
  //appDirectory: `./${buildDir}/DiSpeak-win32-ia32`,
  outputDirectory: `./${releaseDir}`,
  loadingGif: `./${sourceDir}/images/loading.gif`,
  authors: srcPackage['name'],
  owners: srcPackage['name'],
  exe: `${srcPackage['name']}.exe`,
  description: srcPackage['description'],
  version: srcPackage['version'],
  title: srcPackage['name'],
  //signWithParams: `signtool sign /a ${srcPackage['name']}.exe`,
  iconUrl: 'https://prfac.com/dispeak/icon.ico',
  setupIcon: `./${sourceDir}/images/icon.ico`,
  setupExe: `DiSpeakSetup-${srcPackage['version']}.exe`,
  noMsi: true
};
// https://github.com/electron-userland/electron-packager/blob/master/docs/api.md
// https://github.com/electron/windows-installer
fs.remove(`./${buildDir}`).then(res => {
    console.log('remove: buildDir');
    return fs.remove(`./${releaseDir}`);
  }).then(res => {
    console.log('remove: releaseDir');
    return packager(packagerOptions);
  }).then(path => {
    console.log('packager: ', path);
    installerOptions.appDirectory = `./${path[0]}`;
    return electronInstaller.createWindowsInstaller(installerOptions);
  }).then(res => {
    console.log('installer: complete');
  }).catch(function(err) {
    console.log('error: ', err);
  });