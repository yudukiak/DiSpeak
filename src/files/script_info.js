// 現在のバージョンを取得
const {ipcRenderer} = require("electron");
const nowVersion = ipcRenderer.sendSync("now-version-check");
// 現在のバージョンを書き込み
document.getElementById("version_num").textContent = `Version ${nowVersion}`;