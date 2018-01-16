// http://tj.hateblo.jp/entry/2016/05/12/164451
const packager = require("electron-packager");
const fs = require("fs");

const package = require("../src/package.json");
const deletefile = require("./deletefile.json");

packager({
  name:      package["name"],
  dir:       "./src",
  out:       "./dist",
  icon:      "./src/images/icon.ico",
  platform:  "win32",
  arch:      "ia32,x64",
  version:   "1.7.10", // Electronのバージョン
  overwrite: true, // 上書き
  asar:      true, // asarパッケージ化
  "app-version":   package["version"],
  "app-copyright": `(C) 2017 ${package["author"]}`,
  // Windowsのみのオプション
  "version-string": {
    CompanyName:      "prfac.com",
    FileDescription:  package["name"],
    OriginalFilename: `${package["name"]}.exe`,
    ProductName:      package["name"],
    InternalName:     package["name"]
  }
},
// 完了時のコールバック
function (err, appPaths) {
  if (err) console.log(err);
  // ファイル削除
  for (var fileName of deletefile){
    var fileDir32 = `./dist/DiSpeak-win32-ia32/${fileName}`;
    var fileDir64 = `./dist/DiSpeak-win32-x64/${fileName}`;
    fs.unlinkSync(fileDir32);
    fs.unlinkSync(fileDir64);
    console.log(`Delete: ${fileName}`);
  }
  console.log(`Create: ${appPaths}`);
});