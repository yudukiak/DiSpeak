"use strct";
// Electronのモジュール
const electron = require("electron");
// アプリケーションをコントロールするモジュール
const app = electron.app;
// メニュー用のモジュール
const Menu = electron.Menu;
// シェル用のモジュール
const shell = electron.shell;
// ウィンドウを作成するモジュール
const BrowserWindow = electron.BrowserWindow;
// メインウィンドウはGCされないようにグローバル宣言
let mainWindow = null;

// 全てのウィンドウが閉じたら終了
app.on("window-all-closed", () => {
  if (process.platform != "darwin") {
    app.quit();
  }
});
// Electronの初期化完了後に実行
app.on("ready", () => {
  //ウィンドウサイズを設定する
  mainWindow = new BrowserWindow({
    width: 640,
    height: 480,
    useContentSize: true,
    'icon': `${__dirname}/images/icon.png`,
  });
  // 使用するhtmlファイルを指定する
  mainWindow.loadURL(`file://${__dirname}/index.html`);
  // ウィンドウメニューをカスタマイズ
  initWindowMenu();
  // ウィンドウメニューを隠す https://stackoverflow.com/questions/32637368/remove-menubar-from-finder-in-electron-on-osx
  // Mac only?
  //app.dock.hide();
  // Windows, Linux
  //mainWindow.setMenu(null);
  // リンクをデフォルトブラウザで開く http://www.fujipro-inc.com/2017/04/29/4689.html
  mainWindow.webContents.on('new-window', (ev,url)=> {
    ev.preventDefault();
    shell.openExternal(url);
  });
  // ウィンドウが閉じられたらアプリも終了
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
});
// ウィンドウメニューをカスタマイズ https://github.com/electron/electron/blob/master/docs/api/browser-window.md
function initWindowMenu(){
  const template = [
    {
      label: 'メニュー',
      submenu: [
        {
          label: 'リロード',
          accelerator: 'CmdOrCtrl+R',
          click: function() { mainWindow.reload(); }
        },
        {
          label: 'デバッグ',
          accelerator: 'CmdOrCtrl+Shift+I',
          click: function() { mainWindow.toggleDevTools(); }
        },
        {
          label: '終了する',
          accelerator: 'CmdOrCtrl+W',
          click: function() { app.quit(); }
        }
      ]
    }
  ]
  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
}
