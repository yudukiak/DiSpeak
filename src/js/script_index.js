const {ipcRenderer} = require("electron");
const directory = ipcRenderer.sendSync("directory-check").replace(/\\/g,"/"); // DiSpeakのディレクトリを取得
const nowVersion = ipcRenderer.sendSync("now-version-check"); // 現在のバージョンを取得
const bouyomiConnect = require(`${directory}/js/bouyomiConnect.js`);
const Discord = require("discord.js");
const client = new Discord.Client();
const fs = require("fs");
const fileName = "setting.json";
const fileName_default = "setting_default.json";
console.info(`Version ${nowVersion}`);
// 設定ファイルの読み込み
readFile();
// 更新ボタン
function reload(){
  location.reload();
}
// 日時の0詰め https://tagamidaiki.com/javascript-0-chink/
function toDoubleDigits(num){
  num += "";
  if (num.length === 1) {
    num = `0${num}`;
  }
  return num;
}
// 正規表現
function replaceNewline(str) {
  var strRep = str.replace(/\n/g, "|");
  var strReg = new RegExp(`^(${strRep})$`);
  return strReg;
}
// 配列の空要素除去filter https://qiita.com/akameco/items/1636e0448e81e17e3646
function filterArray(ary){
  var ary = ary.filter(Boolean);
  return ary;
}
// エスケープ
function escapeHtml(str) {
  var str = str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  return str;
}
function logProcess(ary){
  var hour = toDoubleDigits(ary.time.getHours());
  var min  = toDoubleDigits(ary.time.getMinutes());
  var sec  = toDoubleDigits(ary.time.getSeconds());
  var text = ary.text.replace(/\r\n|\n|\r/,"");
  var textEsc = escapeHtml(`[${hour}:${min}:${sec}] <${ary.type}> ${ary.name} ${text}`); // [time] <type> name text
  var textRep = textEsc.replace(/&lt;(:.+:)([0-9]+)&gt;/g, '<img class="emoji" src="https://cdn.discordapp.com/emojis/$2.png" alt="$1" draggable="false">');
  var pElement = document.createElement("p"); // 要素作成
  pElement.innerHTML = textRep; // 要素にテキストを設定
  document.getElementById("log").prepend(pElement); // 要素を追加
  // ログの削除
  var logP = document.querySelectorAll("#log p");
  var maxLine = 50; // 表示される最大行数
  if(logP.length > maxLine){ // 行数を超えたら古いログを削除
    for(var i=maxLine,n=logP.length; i<n; i++){
      logP[i].remove();
    }
  }
}
function bouyomiDisabled(){
  document.getElementById("bouyomi_status").innerHTML =
    `<input type="button" class="button button-disabled" name="bouyomi_start" value="読み上げ開始">`+
    `<p class="comment">「画面を更新」してから「読み上げ開始」してください。</p>`;
}
function bouyomiStart(){
  bouyomiExeStart();
  var d_token = document.querySelector('input[name="d_token"]').value;
  var startTime = new Date();
  var startMess = "読み上げを開始しています。";
  document.getElementById("bouyomi_status").innerHTML =
    `<input type="button" class="button button-disabled" name="bouyomi_start" value="読み上げ開始">`+
    `<p class="comment">${startMess}</p>`;
  var ary = {
    time: startTime,
    type: "info",
    name: "",
    text: startMess
  };
  logProcess(ary);
  if(d_token == ""){
    var tokenText = "Error: The token is not filled in.";
    errorLog("token", tokenText);
    return;
  }
  client.login(d_token).catch(function(error){
    errorLog("login", error);
  });
}
function bouyomiProcess(ary){
  // チャンネル（DM, Group, Server）を読ませるか
  var d_channel = document.getElementById("d_channel").d_channel.value;
  var type = (function() {
    if(d_channel=="1") return "";
    return ary.type;
  })();
  // 名前を読ませるか
  var d_dm_name = document.getElementById("d_dm_name").d_dm_name.value;
  var d_gr_name = document.getElementById("d_gr_name").d_gr_name.value;
  var d_sv_name = document.getElementById("d_sv_name").d_sv_name.value;
  var name = (function() {
    if(d_dm_name=="1" && ary.type=="dm") return "";
    if(d_gr_name=="1" && ary.type=="group") return "";
    if(d_sv_name=="1" && ary.type!="dm" && ary.type!="group") return "";
    return ary.name;
  })();
  // 読ませる文章を生成
  var text = `${type} ${name} ${ary.text}`;
  // 読ませる文章の調整
  var textBym = text.replace(/<:(.+):([0-9]+)>/g, "（スタンプ）").replace(/\s+/g, "").trim();
  // 棒読みちゃんの処理
  var ip   = document.querySelector('input[name="b_ip"]').value;
  var port = document.querySelector('input[name="b_port"]').value;
  var bouyomiServer = {};
  bouyomiServer.host = ip;
  bouyomiServer.port = port;
  bouyomiConnect.sendBouyomi(bouyomiServer, textBym);
}
function bouyomiDialog(){
  var bouyomiDir = ipcRenderer.sendSync("bouyomi-dir-dialog");
  if(bouyomiDir == ""){return;}
  if(!bouyomiDir.match(/BouyomiChan\.exe/)){
    ipcRenderer.send("bouyomi-exe-alert");
    return;
  }
  document.querySelector('input[name="b_dir"]').value = bouyomiDir;
}
function bouyomiExeStart(){
  var bouyomiDir = document.querySelector('input[name="b_dir"]').value;
  if(bouyomiDir == "" || !bouyomiDir.match(/BouyomiChan\.exe/)){return;}
  ipcRenderer.send("bouyomi-exe-start", bouyomiDir);
}
// ファイルを表示
function readFile(){
  fs.readFile(`${fileName}`, "utf8", (error, setting) => {
    if(error){
      errorHandling(error);
      return;
    }
    var settingAry = JSON.parse(setting);
    for(key in settingAry){
      var settingAryKey = settingAry[key];
      switch(key){
        // Discord 基本設定
        case "d_token":        document.querySelector('input[name="d_token"]').value = settingAryKey; break;
        case "d_user":         document.getElementById("d_user").d_user[settingAryKey].checked = true; break;
        case "d_channel":      document.getElementById("d_channel").d_channel[settingAryKey].checked = true; break;
        // Discord DM設定
        case "d_dm":           document.getElementById("d_dm").d_dm[settingAryKey].checked = true; break;
        case "d_dm_name":      document.getElementById("d_dm_name").d_dm_name[settingAryKey].checked = true; break;
        case "d_dm_list":      document.getElementById("d_dm_list").d_dm_list[settingAryKey].checked = true; break;
        case "d_dm_list_b":    document.querySelector('textarea[name="d_dm_list_b"]').value = settingAryKey.join("\n"); break;
        case "d_dm_list_w":    document.querySelector('textarea[name="d_dm_list_w"]').value = settingAryKey.join("\n"); break;
        // Discord グループ設定
        case "d_gr":           document.getElementById("d_gr").d_gr[settingAryKey].checked = true; break;
        case "d_gr_name":      document.getElementById("d_gr_name").d_gr_name[settingAryKey].checked = true; break;
        case "d_gr_list":      document.getElementById("d_gr_list").d_gr_list[settingAryKey].checked = true; break;
        case "d_gr_list_b":    document.querySelector('textarea[name="d_gr_list_b"]').value = settingAryKey.join("\n"); break;
        case "d_gr_list_w":    document.querySelector('textarea[name="d_gr_list_w"]').value = settingAryKey.join("\n"); break;
        // Discord サーバ設定
        case "d_sv":           document.getElementById("d_sv").d_sv[settingAryKey].checked = true; break;
        case "d_sv_nick":      document.getElementById("d_sv_nick").d_sv_nick[settingAryKey].checked = true; break;
        case "d_sv_name":      document.getElementById("d_sv_name").d_sv_name[settingAryKey].checked = true; break;
        case "d_sv_sv_list":   document.getElementById("d_sv_sv_list").d_sv_sv_list[settingAryKey].checked = true; break;
        case "d_sv_sv_list_b": document.querySelector('textarea[name="d_sv_sv_list_b"]').value = settingAryKey.join("\n"); break;
        case "d_sv_sv_list_w": document.querySelector('textarea[name="d_sv_sv_list_w"]').value = settingAryKey.join("\n"); break;
        case "d_sv_ch_list":   document.getElementById("d_sv_ch_list").d_sv_ch_list[settingAryKey].checked = true; break;
        case "d_sv_ch_list_b": document.querySelector('textarea[name="d_sv_ch_list_b"]').value = settingAryKey.join("\n"); break;
        case "d_sv_ch_list_w": document.querySelector('textarea[name="d_sv_ch_list_w"]').value = settingAryKey.join("\n"); break;
        // 棒読みちゃん 基本設定
        case "b_dir":           document.querySelector('input[name="b_dir"]').value = settingAryKey; break;
        case "b_ip":           document.querySelector('input[name="b_ip"]').value = settingAryKey; break;
        case "b_port":         document.querySelector('input[name="b_port"]').value = settingAryKey; break;
      }
    }
    var readTime = new Date();
    var ary = {
      time: readTime,
      type: "info",
      name: "",
      text: "設定ファイルを読み込みました。"
    };
    logProcess(ary);
  });
}
// ファイルへ書き込み
function writeFile(){
  var settingAry = {};
  // Discord 基本設定
  settingAry.d_token        = document.querySelector('input[name="d_token"]').value;
  settingAry.d_user         = Number(document.getElementById("d_user").d_user.value);
  settingAry.d_channel      = Number(document.getElementById("d_channel").d_channel.value);
  // Discord DM設定
  settingAry.d_dm           = Number(document.getElementById("d_dm").d_dm.value);
  settingAry.d_dm_name  = Number(document.getElementById("d_dm_name").d_dm_name.value);
  settingAry.d_dm_list      = Number(document.getElementById("d_dm_list").d_dm_list.value);
  settingAry.d_dm_list_b    = filterArray(document.querySelector('textarea[name="d_dm_list_b"]').value.replace(/[ 　\t]/g,"").split("\n"));
  settingAry.d_dm_list_w    = filterArray(document.querySelector('textarea[name="d_dm_list_w"]').value.replace(/[ 　\t]/g,"").split("\n"));
  // Discord グループ設定
  settingAry.d_gr           = Number(document.getElementById("d_gr").d_gr.value);
  settingAry.d_gr_name  = Number(document.getElementById("d_gr_name").d_gr_name.value);
  settingAry.d_gr_list      = Number(document.getElementById("d_gr_list").d_gr_list.value);
  settingAry.d_gr_list_b    = filterArray(document.querySelector('textarea[name="d_gr_list_b"]').value.replace(/[ 　\t]/g,"").split("\n"));
  settingAry.d_gr_list_w    = filterArray(document.querySelector('textarea[name="d_gr_list_w"]').value.replace(/[ 　\t]/g,"").split("\n"));
  // Discord サーバ設定
  settingAry.d_sv           = Number(document.getElementById("d_sv").d_sv.value);
  settingAry.d_sv_nick      = Number(document.getElementById("d_sv_nick").d_sv_nick.value);
  settingAry.d_sv_name  = Number(document.getElementById("d_sv_name").d_sv_name.value);
  settingAry.d_sv_sv_list   = Number(document.getElementById("d_sv_sv_list").d_sv_sv_list.value);
  settingAry.d_sv_sv_list_b = filterArray(document.querySelector('textarea[name="d_sv_sv_list_b"]').value.replace(/[ 　\t]/g,"").split("\n"));
  settingAry.d_sv_sv_list_w = filterArray(document.querySelector('textarea[name="d_sv_sv_list_w"]').value.replace(/[ 　\t]/g,"").split("\n"));
  settingAry.d_sv_ch_list   = Number(document.getElementById("d_sv_ch_list").d_sv_ch_list.value);
  settingAry.d_sv_ch_list_b = filterArray(document.querySelector('textarea[name="d_sv_ch_list_b"]').value.replace(/[ 　\t]/g,"").split("\n"));
  settingAry.d_sv_ch_list_w = filterArray(document.querySelector('textarea[name="d_sv_ch_list_w"]').value.replace(/[ 　\t]/g,"").split("\n"));
  // 棒読みちゃん 基本設定
  settingAry.b_dir          = document.querySelector('input[name="b_dir"]').value;
  settingAry.b_ip           = document.querySelector('input[name="b_ip"]').value;
  settingAry.b_port         = document.querySelector('input[name="b_port"]').value;
  var setting = JSON.stringify(settingAry, null, 4);
  fs.writeFile(`${fileName}`, setting, (error) => {
    if(error){
      errorHandling(error);
      return;
    }
    var writTime = new Date();
    var writMess = "設定ファイルを保存しました。";
    document.getElementById("save_information").textContent = writMess;
    var ary = {
      time: writTime,
      type: "info",
      name: "",
      text: writMess
    };
    logProcess(ary);
  });
}
function createFile(){
  fs.readFile(`${directory}/files/${fileName_default}`, "utf8", (error, setting) => {
    if(error){return;}
    fs.writeFile(`${fileName}`, setting, (error) => {
      if(error){return;}
      var createTime = new Date();
      var createText = "<info> 設定ファイルを作成しました。「設定を編集」より設定を行ってください。"
      var ary = {
        time: createTime,
        type: "info",
        name: "",
        text: "設定ファイルを作成しました。「設定を編集」より設定を行ってください。"
      };
      logProcess(ary);
      readFile();
    });
  });
}
function errorHandling(error){
  var errorTime = new Date(),
    errorCode = error.code,
    errorMess = (function(){
      if(errorCode.match(/ENOENT/)) return      "設定ファイルが存在しませんでした。";
      if(errorCode.match(/EPERM|EBUSY/)) return `設定ファイルを保存できませんでした。${fileName}を開いている場合は閉じてください。`;
    })(),
    ary = {
      time: errorTime,
      type: "info",
      name: "",
      text: "errorMess"
    };
  logProcess(ary);
  if(errorCode.match(/ENOENT/)){
    createFile();
  }
  return;
}
client.on("ready", () => {
  var readyTime    = new Date();
  var readyMess = "読み上げを開始しました。";
  document.querySelector("#bouyomi_status p").textContent = readyMess;
  var ary = {
    time: readyTime,
    type: "info",
    name: "",
    text: readyMess
  };
  logProcess(ary);
  bouyomiProcess(ary);
});
client.on("reconnecting", () => {
  var reconnectTime    = new Date();
  var reconnectMess = "再接続をします。";
  document.querySelector("#bouyomi_status p").textContent = reconnectMess;
  var ary = {
    time: reconnectTime,
    type: "info",
    name: "",
    text: reconnectMess
  };
  logProcess(ary);
});
client.on("message", message => {
  debugLog("message", message);
  // Discord 基本設定
  var d_user         = document.getElementById("d_user").d_user.value;
  // Discord DM設定
  var d_dm           = document.getElementById("d_dm").d_dm.value;
  var d_dm_list      = document.getElementById("d_dm_list").d_dm_list.value;
  var d_dm_list_b    = document.querySelector('textarea[name="d_dm_list_b"]').value;
  var d_dm_list_w    = document.querySelector('textarea[name="d_dm_list_w"]').value;
  // Discord グループ設定
  var d_gr           = document.getElementById("d_gr").d_gr.value;
  var d_gr_list      = document.getElementById("d_gr_list").d_gr_list.value;
  var d_gr_list_b    = document.querySelector('textarea[name="d_gr_list_b"]').value;
  var d_gr_list_w    = document.querySelector('textarea[name="d_gr_list_w"]').value;
  // Discord サーバ設定
  var d_sv           = document.getElementById("d_sv").d_sv.value;
  var d_sv_nick      = document.getElementById("d_sv_nick").d_sv_nick.value;
  var d_sv_sv_list   = document.getElementById("d_sv_sv_list").d_sv_sv_list.value;
  var d_sv_sv_list_b = document.querySelector('textarea[name="d_sv_sv_list_b"]').value;
  var d_sv_sv_list_w = document.querySelector('textarea[name="d_sv_sv_list_w"]').value;
  var d_sv_ch_list   = document.getElementById("d_sv_ch_list").d_sv_ch_list.value;
  var d_sv_ch_list_b = document.querySelector('textarea[name="d_sv_ch_list_b"]').value;
  var d_sv_ch_list_w = document.querySelector('textarea[name="d_sv_ch_list_w"]').value;
  // 自身の通知を読むか
  var user_id = client.user.id;
  var authorId = message.author.id;
  if(d_user=="1" && user_id==authorId){return;}
  // 使用するID
  // DM SV 判定   message.channel.type
  // DM UserId    message.channel.recipient.id
  // SV ServerID  message.channel.guild.id
  // SV ChannelID message.channel.id
  // 使用しないID
  // DM UserId    message.author.id
  // SV ServerID  message.member.guild.id
  // SV ServerID  message.mentions._guild.id
  // DM・グループ・サーバを読む・読まないの処理
  var channelType = message.channel.type;
  if(channelType=="dm"   && d_dm=="1"){return;}else
  if(channelType=="group" && d_gr=="1"){return;}else
  if(channelType=="text" && d_sv=="1"){return;}
  // ホワイトリスト・ブラックリストの処理
  // 1.  DMかグループかサーバを確認        channelType
  // 2.  リスト設定がどっちかを確認        d_dm_list,   d_sv_sv_list,   d_sv_ch_list   0ブラックリスト, 1ホワイトリスト
  // 3-1.ブラックリストのIDならreturn      d_dm_list_b, d_sv_sv_list_b, d_sv_ch_list_b
  // 3-2.ホワイトリスト以外のIDならreturn  d_dm_list_w, d_sv_sv_list_w, d_sv_ch_list_w
  if(channelType == "dm"){
    var dmUserId = message.channel.recipient.id;
    if(d_dm_list=="0" &&  dmUserId.match(replaceNewline(d_dm_list_b))){return;}else
    if(d_dm_list=="1" && !dmUserId.match(replaceNewline(d_dm_list_w)) && d_dm_list_w.length>10){return;}
  }else if(channelType == "group"){
    var grUserId = message.channel.id;
    if(d_gr_list=="0" &&  grUserId.match(replaceNewline(d_gr_list_b))){return;}else
    if(d_gr_list=="1" && !grUserId.match(replaceNewline(d_gr_list_w)) && d_gr_list_w.length>10){return;}
  }else if(channelType == "text"){
    var svServerId  = message.channel.guild.id;
    var svChannelId = message.channel.id;
    if(d_sv_sv_list=="0" &&  svServerId.match(replaceNewline(d_sv_sv_list_b))){return;}else
    if(d_sv_sv_list=="1" && !svServerId.match(replaceNewline(d_sv_sv_list_w)) && d_sv_sv_list_w.length>10){return;}else
    if(d_sv_ch_list=="0" &&  svChannelId.match(replaceNewline(d_sv_ch_list_b))){return;}else
    if(d_sv_ch_list=="1" && !svChannelId.match(replaceNewline(d_sv_ch_list_w)) && d_sv_ch_list_w.length>10){return;}
  }
  // 名前の処理
  var nickname = (function() {
    if(channelType=="text" && message.member!==null) return message.member.nickname;
    return "";
  })();
  var username = (function() {
    // d_sv_nickが無効の時、DMの時、グループの時、nicknameが無いとき(DM)、サーバで未設定のとき
    if(d_sv_nick=="1" || channelType=="dm" || channelType=="group" || nickname=="" || nickname===null) return message.author.username;
    return nickname;
  })();
  // サーバー名
  var guildName = (function() {
    if(channelType == "dm") return "dm";
    if(channelType == "group") return "group";
    return message.channel.guild.name;
  })();
  // チャットの内容
  var content = message.content;
  // リプライを読ませない
  var content = content.replace(/<@!?[0-9]+>/g, "");
  // チャンネルタグを読ませない
  var content = content.replace(/<#[0-9]+>/g, "");
  // 画像オンリー、スペースのみを読ませない
  if(content=="" || /^([\s]+)$/.test(content)){return;}
  // チャットの時間
  var utc  = message.createdTimestamp; // UTC
  var jst  = utc + (60 * 60 * 9); // +9hour
  var time = new Date(jst);
  var ary = {
    time: time,
    type: guildName,
    name: username,
    text: content
  };
  // 処理
  logProcess(ary);
  bouyomiProcess(ary);
});
// エラーが起きたときの処理
//client.on("debug", (message) => {
//  errorLog("debug", message);
//});
client.on("error", (message) => {
  errorLog("error", message);
});
client.on("warn", (message) => {
  errorLog("warn", message);
});
process.on("uncaughtException", (message) => {
  errorLog("uncaughtException", message);
});
process.on("unhandledRejection", (message) => {
  errorLog("unhandledRejection", message);
});
// エラーをログへ書き出す
function errorLog(fnc, error){
  var errorStr = (function(){
    if(toString.call(error) == "[object Event]") return JSON.stringify(error);
    return String(error);
  })();
  if(errorStr.match(/Error: Cannot find module '\.\.\/setting\.json'/)){return;}
  var errorMess = (function(){
    if(errorStr.match(/{"isTrusted":true}/)) return "インターネットに接続できません。再接続をします。";
    if(errorStr.match(/TypeError: Failed to fetch/)) return "インターネットに接続できません。";
    if(errorStr.match(/Error: Something took too long to do/)) return "Discordに接続できません。";
    if(errorStr.match(/Error: connect ECONNREFUSED/)) return "棒読みちゃんが起動していない、もしくは接続できません。";
    if(errorStr.match(/Error: getaddrinfo ENOTFOUND/)) return "IPが正しくありません。";
    if(errorStr.match(/RangeError: "port" option should be/)) return "ポートが正しくありません。";
    if(errorStr.match(/Error: Incorrect login details were provided/)) return "トークンが正しくありません。";
    if(errorStr.match(/Error: Uncaught, unspecified "error" event/)) return "エラーが発生しました。";
    if(errorStr.match(/Error: The token is not filled in/)) return "トークンが記入されていません。";
    if(errorStr.match(/ReferenceError: ([\s\S]*?) is not defined/)) return `変数 ${errorStr.split(" ")[1]} が定義されていません。@micelle9までご連絡ください。`;
    return `不明なエラーが発生しました。（${errorStr}）`;
  })();
  var errTime = new Date();
  var ary = {
    time: errTime,
    type: "error",
    name: "",
    text: errorMess
  };
  logProcess(ary);
  debugLog(fnc, error);
  document.getElementById("bouyomi_status").innerHTML =
    `<input type="button" class="button" name="setting_save" value="画面を更新" onclick="reload();">`+
    `<p class="comment">エラーが発生しました。</p>`;
}
// デバッグ用
var debugFnc = "start";
var debugTxt = "Start debug mode.";
debugLog(debugFnc, debugTxt);
function debugLog(fnc, txt){
  fs.readFile(`${fileName}`, "utf8", (error, file) => {
    if(error || file == void 0){return;}
    var file = JSON.parse(file);
    if(file.debug!=true){return;}
    var time = new Date();
    var hour = toDoubleDigits(time.getHours());
    var min = toDoubleDigits(time.getMinutes());
    var sec = toDoubleDigits(time.getSeconds());
    var txtCall = toString.call(txt);
    var txtStr = (function(){
      if(txtCall == "[object Event]") return JSON.stringify(txt);
      return String(txt);
    })();
    console.groupCollapsed(`${hour}:${min}:${sec} %s`, fnc);
    console.log(txtCall);
    console.log(txtStr);
    console.log(txt);
    console.groupEnd();
  });
}