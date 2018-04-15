"use strct";
// モジュールの読み込み
const {app, Menu, Tray, shell, BrowserWindow, dialog, ipcMain} = require("electron");
const {execFile} = require("child_process");
const request = require("request");
const package = require("./package.json");
// 変数の指定
const nowVersion = package["version"];
const appName = app.getName();
let mainWindow = null; // メインウィンドウはGCされないようにグローバル宣言
let infoWindow = null;
let tray = null;
// 起動時にバージョンのチェックを行う
const apiOptions = {
  url: "https://api.github.com/repos/micelle/dc_DiSpeak/releases/latest",
  headers: {"User-Agent": "Awesome-Octocat-App"},
  json: true
};
request.get(apiOptions, apiCheck_s);
// Electronの初期化完了後に実行
app.on("ready", () => {
  createMainwindow(); // mainWindowの生成
});
// 全てのウィンドウが閉じたら終了
app.on("window-all-closed", () => {
  if(process.platform != "darwin"){
    app.quit();
  }
});
// ------------------------------
// 処理用の関数
// ------------------------------
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
// メインウィンドウの処理
function createMainwindow(){
  // タスクトレイを表示
  createTray();
  //ウィンドウサイズを設定する
  mainWindow = new BrowserWindow({
    frame: false,
    show: false,
    width: 640,
    height: 480,
    icon: `${__dirname}/images/icon.png`,
  });
  // ウィンドウメニューをカスタマイズ
  let template = mainWindowMenu();
  let menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
  // 使用するhtmlファイルを指定する
  mainWindow.loadURL(`file://${__dirname}/index.html`);
  // リンクをデフォルトブラウザで開く
  mainWindow.webContents.on("new-window", (ev,url) => {
    ev.preventDefault();
    shell.openExternal(url);
  });
  // ウィンドウの準備ができたら表示
  mainWindow.on("ready-to-show", () => {
    mainWindow.show();
  });
  // ウィンドウが閉じられたらアプリも終了
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}
// タスクトレイ
function createTray(){
  tray = new Tray(`${__dirname}/images/icon.png`);
  let template = taskTrayMenu();
  let menu = Menu.buildFromTemplate(template)
  tray.setContextMenu(menu);
  tray.setToolTip(`${appName} v${nowVersion}`);
  tray.on('click', function(){
    mainWindow.show();
  });
}
// でぃすぴーくについて、のウィンドウ
function infoWindowOpen(){
  infoWindow = new BrowserWindow({
    show: false,
    width: 320,
    height: 240,
    parent: mainWindow,
    icon: `${__dirname}/images/icon.png`,
  });
  infoWindow.loadURL(`file://${__dirname}/info.html`);
  infoWindow.setMenu(null);
  infoWindow.webContents.on("new-window", (ev,url) => {
    ev.preventDefault();
    shell.openExternal(url);
  });
  infoWindow.once("ready-to-show", () => {
    infoWindow.show();
  });
  infoWindow.on("closed", () => {
    infoWindow = null;
  });
}
// ------------------------------
// レンダラープロセスとのやりとり
// ------------------------------
// 現在のバージョンを返す
ipcMain.on("now-version-check", (event) => {
  event.returnValue = nowVersion;
})
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
  execFile(arg, function(error, stdout, stderr) {
    if (error != null) {
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
ipcMain.on("bouyomi-exe-alert", () => {
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
ipcMain.on("directory-src-check", (event) => {
  event.returnValue = app.getAppPath();
});
ipcMain.on("directory-exe-check", (event) => {
  event.returnValue = app.getPath("exe");
});
// UIの挙動
ipcMain.on("window-minimize", () => {
  mainWindow.minimize();
});
ipcMain.on("window-maximize", () => {
  if(mainWindow.isMaximized()){
    mainWindow.unmaximize();
  } else {
    mainWindow.maximize();
  }
});
ipcMain.on("window-close", () => {
  mainWindow.hide();
});
// ------------------------------
// その他
// ------------------------------
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
// ウィンドウメニューをカスタマイズ
function mainWindowMenu(){
  let template = [
    {
      label: "メニュー",
      submenu: [
        {
          label: "リロード",
          accelerator: "CmdOrCtrl+R",
          click: function(){mainWindow.reload();}
        },
        {
          label: "終了する",
          accelerator: "CmdOrCtrl+W",
          position: "endof=cmd",
          click: function(){app.quit();}
        }
      ]
    },
    {
      label: "ヘルプ",
      submenu: [
        {
          label: "Wikiを開く",
          accelerator: "F1",
          click: function(){shell.openExternal("https://github.com/micelle/dc_DiSpeak/wiki");}
        },
        {
          label: "デバッグ - main",
          accelerator: "CmdOrCtrl+Shift+I",
          position: "endof=debug",
          click: function(){mainWindow.toggleDevTools();}
        },
        {
          label: "デバッグ - info",
          accelerator: "CmdOrCtrl+Shift+O",
          position: "endof=debug",
          click: function(){infoWindow.toggleDevTools();}
        },
        {
          label: "最新のバージョンを確認",
          accelerator: "CmdOrCtrl+H",
          position: "endof=info",
          click: function(){request.get(apiOptions, apiCheck_c);}
        },
        {
          label: "でぃすぴーくについて",
          accelerator: "CmdOrCtrl+N",
          position: "endof=info",
          click: function(){infoWindowOpen();}
        }
      ]
    }
  ];
  return template;
}
function taskTrayMenu(){
  let template = [
    {
      label: "Wikiを開く",
      click: function(){shell.openExternal("https://github.com/micelle/dc_DiSpeak/wiki");}
    },
    {
      label: "表示する",
      position: "endof=cmd",
      click: function(){mainWindow.show();}
    },
    {
      label: "終了する",
      position: "endof=cmd",
      click: function(){mainWindow.close();}
    }
  ];
  return template;
}