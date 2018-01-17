// 書き込み
function textContents(target, text){
  document.getElementById(target).textContent = text;
}

// 以下、index.jsから結果を受け取るコードを書く予定です…（内容が重複しているので）

// 現在のバージョン
const package = require("../package.json");
const nowVersion = package["version"];
let target = "version_num";
let text   = `Version ${nowVersion}`;
textContents(target, text);

// バージョンチェック
const request = require("request");
const apiOptions = {
  url: "https://api.github.com/repos/micelle/dc_DiSpeak/releases/latest",
  headers: {"User-Agent": "Awesome-Octocat-App"},
  json: true
};
function apiCheck(err, res, data){
  let target = "version_txt";
  if(!err && res.statusCode==200){
    // APIの上限を超えたとき
    let relMessage = data.message;
    if(relMessage !== void 0){
      let text = "最新のバージョン取得に失敗しました。";
      textContents(target, text);
      return;
    }
    // APIを取得できたとき
    let relVer = data.tag_name;
    //let relVer = "v11.45.14"; // テスト用
    let relVer_v = relVer.replace(/v/g, "");
    let relName = data.name;
    let relUrl = data.html_url;
    if(nowVersion != relVer_v){
      let text = `お使いのバージョンは古いっす（最新版：${relVer_v}）`;
      textContents(target, text);
    }else{
      let text = "最新のバージョンを使ってるっす";
      textContents(target, text);
    }
  }
}
request.get(apiOptions, apiCheck);