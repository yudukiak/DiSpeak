"use strct";
// Electron https://electronjs.org/docs
const {app, Menu, shell, BrowserWindow, dialog, ipcMain} = require("electron");
const {exec} = require("child_process");
let mainWindow = null; // メインウィンドウはGCされないようにグローバル宣言
let infoWindow = null;

// 現在のバージョン
const package = require("./package.json");
const nowVersion = package["version"];

// 現在のバージョンを返す
ipcMain.on("now-version-check", (event) => {
  event.returnValue = nowVersion;
})

// APIへアクセス https://maku77.github.io/nodejs/net/request-module.html
const request = require("request");
const apiOptions = {
  url: "https://api.github.com/repos/micelle/dc_DiSpeak/releases/latest",
  headers: {"User-Agent": "Awesome-Octocat-App"},
  json: true
};
request.get(apiOptions, apiCheck_s);
function apiCheck_s(err, res, data){if(!err && res.statusCode==200){relCheck(data, "start");}}
function apiCheck_c(err, res, data){if(!err && res.statusCode==200){relCheck(data, "check");}}
function relCheck(data, status){
  // APIの上限を超えたとき
  let relMessage = data.message;
  if(relMessage !== void 0 && status == "check"){
    let mesOptions = {
      type: "error",
      buttons: ["OK"],
      title: "エラー",
      message: "最新のバージョン取得に失敗しました。",
      detail: "時間を置いてからご確認ください。お願いします。"
    };
    dialog.showMessageBox(mesOptions);
    return;
  }
  // APIを取得できたとき
  let relVer = data.tag_name;
  //let relVer = (function(){if(status == "check") return data.tag_name;return "v11.45.14";})(); // テスト用
  let relVer_v = relVer.replace(/v/g, "");
  let relName = data.name;
  let relUrl = data.html_url;
  // バージョンチェック
  let nowVer = arraySplit(nowVersion);
  let newVer = arraySplit(relVer_v);
  let result = updateCheck(nowVer, newVer);
  if(result){
    let mesOptions = {
      type: "warning",
      buttons: ["Yes", "No"],
      title: relName,
      message: "おぉっと？",
      detail: `お使いのバージョンは古いっす。ダウンロードページ開く？？\n\n` +
          `現在のバージョン：${nowVersion}\n最新のバージョン：${relVer_v}`
    };
    dialog.showMessageBox(mesOptions, function(res){if(res == 0){shell.openExternal(relUrl);}});
  }else if(status == "check"){
    let mesOptions = {
      type: "info",
      buttons: ["OK"],
      title: relName,
      message: "おぉ…！！",
      detail: `最新のバージョンを使ってるっす。ありがとおぉおおぉっ！！\n\n` +
          `現在のバージョン：${nowVersion}\n最新のバージョン：${relVer_v}`
    };
    dialog.showMessageBox(mesOptions);
  }
}

// 全てのウィンドウが閉じたら終了
app.on("window-all-closed", () => {
  if(process.platform != "darwin"){
    app.quit();
  }
});
// Electronの初期化完了後に実行
app.on("ready", ()=> {
  //ウィンドウサイズを設定する
  mainWindow = new BrowserWindow({
    width: 640,
    height: 480,
    icon: `${__dirname}/images/icon.png`,
  });
  // ウィンドウメニューをカスタマイズ
  initWindowMenu();
  // 使用するhtmlファイルを指定する
  mainWindow.loadURL(`file://${__dirname}/index.html`);
  // リンクをデフォルトブラウザで開く http://www.fujipro-inc.com/2017/04/29/4689.html
  mainWindow.webContents.on("new-window", (ev,url)=> {
    ev.preventDefault();
    shell.openExternal(url);
  });
  // ウィンドウが閉じられたらアプリも終了
  mainWindow.on("closed", ()=> {
    mainWindow = null;
  });
});
// でぃすぴーくについて、のウィンドウ
function infoWindowOpen(){
  infoWindow = new BrowserWindow({
    width: 320,
    height: 240,
    show: false,
    parent: mainWindow,
    icon: `${__dirname}/images/icon.png`,
  });
  infoWindow.loadURL(`file://${__dirname}/info.html`);
  infoWindow.setMenu(null);
  infoWindow.webContents.on("new-window", (ev,url)=> {
    ev.preventDefault();
    shell.openExternal(url);
  });
  infoWindow.once("ready-to-show", ()=> {
    infoWindow.show();
  });
  infoWindow.on("closed", ()=> {
    infoWindow = null;
  });
}
// ウィンドウメニューをカスタマイズ https://github.com/electron/electron/blob/master/docs/api/browser-window.md
function initWindowMenu(){
  const template = [
    {
      label: "メニュー",
      submenu: [
        {
          label: "リロード",
          accelerator: "CmdOrCtrl+R",
          click: function() { mainWindow.reload(); }
        },
        {
          label: "終了する",
          accelerator: "CmdOrCtrl+W",
          position: 'endof=cmd',
          click: function() { app.quit(); }
        }
      ]
    },
    {
      label: "ヘルプ",
      submenu: [
        {
          label: "Wikiを開く",
          accelerator: "F1",
          click: function() { shell.openExternal("https://github.com/micelle/dc_DiSpeak/wiki"); }
        },
        {
          label: "デバッグ - main",
          accelerator: "CmdOrCtrl+Shift+I",
          position: 'endof=debug',
          click: function() { mainWindow.toggleDevTools(); }
        },
        {
          label: "デバッグ - info",
          accelerator: "CmdOrCtrl+Shift+O",
          position: 'endof=debug',
          click: function() { infoWindow.toggleDevTools(); }
        },
        {
          label: "最新のバージョンを確認",
          accelerator: "CmdOrCtrl+H",
          position: 'endof=info',
          click: function() { request.get(apiOptions, apiCheck_c); }
        },
        {
          label: "でぃすぴーくについて",
          accelerator: "CmdOrCtrl+N",
          position: 'endof=info',
          click: function() { infoWindowOpen(); }
        }
      ]
    }
  ]
  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
}

// バージョンを配列化
function arraySplit(ver){
  let verAry = ver.split(".");
  let verAry_n = [];
  for(let v of verAry) {
    let num = Number(v);
    verAry_n.push(num);
  }
  return verAry_n;
}
// バージョンの確認
function updateCheck(nowVer, newVer){
  let nowMajor=nowVer[0], nowMinor=nowVer[1], nowBuild=nowVer[2],
    newMajor=newVer[0], newMinor=newVer[1], newBuild=newVer[2];
  if(newMajor>nowMajor){return true;}else if(newMajor<nowMajor){return false;}else
  if(newMinor>nowMinor){return true;}else if(newMinor<nowMinor){return false;}else
  if(newBuild>nowBuild){return true;}else if(newBuild<nowBuild){return false;}else{return false;}
}

// 棒読みちゃんのディレクトリ
ipcMain.on("bouyomi-dir-dialog", (event) => {
  let options = {
    title: "選択",
    filters: [{name: "EXE File", extensions: ["exe"]}],
    defaultPath: ".",
    properties: ["openFile"],
  };
  dialog.showOpenDialog(options, (filePaths) => {
    let filePath = (function(){
      if(filePaths == void 0) return "";
      return filePaths[0];
    })();
    event.returnValue = filePath;
  });
});
ipcMain.on("bouyomi-exe-start", (event, arg) => {
  exec(arg, function(error, stdout, stderr) {
    if (error != null) {
      console.log(error);
      let mesOptions = {
        type: "error",
        buttons: ["OK"],
        title: "エラー",
        message: "棒読みちゃんを起動できませんでした。",
        detail: `ディレクトリを間違えていないか、ご確認ください。\n\n${error.cmd}`
      };
      dialog.showMessageBox(mesOptions);
    }
  });
});
ipcMain.on("bouyomi-exe-alert", (event) => {
  let mesOptions = {
    type: "error",
    buttons: ["OK"],
    title: "エラー",
    message: "選択したファイルが異なります。",
    detail: "「BouyomiChan.exe」を選択してください。"
  };
  dialog.showMessageBox(mesOptions);
});

// DiSpeakのディレクトリを返す
ipcMain.on("directory-check", (event) => {
  event.returnValue = app.getAppPath();
})

// エラーの処理
process.on("uncaughtException", (err) => {
  let errStr = String(err);
  let errMess = (function(){
    if(errStr.match(/'toggleDevTools' of null/)) return "「でぃすぴーくについて」が開かれていません";
    return "不明なエラー";
  })();
  let mesOptions = {
    type: "error",
    buttons: ["OK"],
    title: "エラーが発生しました",
    message: `${errMess}`,
    detail: `詳細：\n${errStr}`
  };
  dialog.showMessageBox(mesOptions);
});