'use strict';
//const fileName = 'setting.json';
const {ipcRenderer} = require('electron');
const Discord = require('discord.js');
//const fs = require('fs');
const swal = require('sweetalert2');
const $ = require('jquery');
const srcDirectory = ipcRenderer.sendSync('directory-app-check').replace(/\\/g, '/');
//const exeDirectory = ipcRenderer.sendSync('directory-exe-check').replace(/\\/g, '/').replace(/\/electron\.exe/, '');
const nowVersion = ipcRenderer.sendSync('now-version-check');
const appSettingAry = ipcRenderer.sendSync('setting-file-read');
const bouyomiConnect = require(`${srcDirectory}/js/bouyomiConnect.js`);
//const $ = jQuery = require(`${srcDirectory}/js/jquery.min.js`);
const client = new Discord.Client();
const jQueryVersion = $.fn.jquery;
// 設定ファイルの読み込み
let fileData = appSettingAry;
readFile();
// ヘッダー
$('#header_minimize').on('click', function() {
  ipcRenderer.send('window-minimize');
});
$('#header_maximize').on('click', function() {
  ipcRenderer.send('window-maximize');
});
$('#header_close').on('click', function() {
  ipcRenderer.send('window-close');
});
// フッター
$('#footer_start').on('click', function() {
  bouyomiExeStart();
  $('#footer_start').addClass('hidden');
  $('#footer_stop').removeClass('hidden');
  setTimeout(function() {
    bouyomiStart();
  }, 3000);
});
$('#footer_setting').on('click', function() {
  $('#main_overlay').addClass('show').removeClass('hide');
});
$('#footer_reload').on('click', function() {
  location.reload();
});
// モーダル
$('#modal_close').on('click', function() {
  $('#main_overlay').addClass('hide').removeClass('show');
  debugLog('modal close', fileData);
});
// 設定
$('#setting_bouyomi_dialog').on('click', function() {
  bouyomiDialog();
});
// オートセーブ
$('textarea, input').bind('keydown keyup keypress mouseup focusout change', function() {
  writeFile('auto save');
});
// 日時の0詰め
function toDoubleDigits(num) {
  const str = String(num);
  const txt = (function() {
    if (str.length == 1) return `0${str}`;
    return str;
  })();
  return txt;
}
// 正規表現
function regularExpression(str) {
  const strRep = str.replace(/[ 　\t]/g, '').replace(/\n/g, '|');
  const strReg = new RegExp(`^(${strRep})$`);
  return strReg;
}
// 改行を配列化
function createArray(str) {
  const ary = str.replace(/[ 　\t]/g, '').split('\n').filter(Boolean);
  return ary;
}
// エスケープ
function escapeHtml(str) {
  const strRep = str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  return strRep;
}

function logProcess(ary) {
  const hour = toDoubleDigits(ary.time.getHours());
  const min = toDoubleDigits(ary.time.getMinutes());
  const sec = toDoubleDigits(ary.time.getSeconds());
  const text = ary.text.replace(/\r\n|\n|\r/, '');
  const textEsc = escapeHtml(`[${hour}:${min}:${sec}] <${ary.type}> ${ary.name} ${text}`); // [time] <type> name text
  const textRep = textEsc.replace(/&lt;(:.+:)([0-9]+)&gt;/g, '<img class="emoji" src="https://cdn.discordapp.com/emojis/$2.png" alt="$1" draggable="false">');
  $('#log').prepend(`<p>${textRep}</p>`);
  // ログの削除
  const logP = $('#log p');
  const maxLine = 50; // 表示される最大行数
  if (logP.length > maxLine) { // 行数を超えたら古いログを削除
    for (let i = maxLine, n = logP.length; i < n; i++) {
      logP[i].remove();
    }
  }
}

function bouyomiAutoStart() {
  if (fileData.s_start != 0) {
    return;
  }
  bouyomiExeStart();
  $('#footer_start').addClass('hidden');
  $('#footer_stop').removeClass('hidden');
  setTimeout(function() {
    bouyomiStart();
  }, 3000);
}

function bouyomiStart() {
  const d_token = fileData.d_token;
  let ary = {};
  ary.time = new Date();
  ary.type = 'info';
  ary.name = '';
  ary.text = '読み上げを開始しています。';
  logProcess(ary);
  if (d_token == null) {
    errorLog('token', 'Error: The token is not filled in.');
    return;
  }
  client.login(d_token).catch(function(error) {
    errorLog('login', error);
  });
}

function bouyomiProcess(ary) {
  // チャンネル（DM, Group, Server）を読ませるか
  const d_channel = fileData.d_channel;
  const type = (function() {
    if (d_channel == 1) return '';
    return ary.type;
  })();
  // 名前を読ませるか
  const d_dm_name = fileData.d_dm_name;
  const d_gr_name = fileData.d_gr_name;
  const d_sv_name = fileData.d_sv_name;
  const name = (function() {
    if (d_dm_name == 1 && ary.type == 'dm') return '';
    if (d_gr_name == 1 && ary.type == 'group') return '';
    if (d_sv_name == 1 && ary.type != 'dm' && ary.type != 'group') return '';
    return ary.name;
  })();
  // 読ませる文章を生成
  const text = `${type} ${name} ${ary.text}`;
  // 読ませる文章の調整
  const textBym = text.replace(/<:(.+):([0-9]+)>/g, '（スタンプ）').replace(/\s+/g, ' ').trim();
  // 棒読みちゃんの処理
  const bouyomiServer = {};
  bouyomiServer.host = fileData.b_ip;
  bouyomiServer.port = fileData.b_port;
  bouyomiConnect.sendBouyomi(bouyomiServer, textBym);
}

function bouyomiDialog() {
  const bouyomiDir = ipcRenderer.sendSync('bouyomi-dir-dialog');
  if (bouyomiDir == '') {
    return;
  } else if (!/BouyomiChan\.exe/.test(bouyomiDir)) {
    ipcRenderer.send('bouyomi-exe-alert');
    return;
  } else {
    $('input[name=b_dir]').val(bouyomiDir);
  }
}

function bouyomiExeStart() {
  const bouyomiDir = fileData.b_dir;
  if (bouyomiDir == '' || !/BouyomiChan\.exe/.test(bouyomiDir)) {
    return;
  } else {
    ipcRenderer.send('bouyomi-exe-start', bouyomiDir);
  }
}
// ファイルを表示
function readFile() {
  let key;
  for (key in fileData) {
    const settingAryKey = fileData[key];
    const type = $.type(settingAryKey);
    if (/^number$/.test(type)) {
      $(`#${key} input`).eq(settingAryKey).prop('checked', true);
    } else if (/^string$/.test(type)) {
      $(`input[name=${key}]`).val(settingAryKey);
    } else if (/^array$/.test(type)) {
      $(`textarea[name=${key}]`).val(settingAryKey.join('\n'));
    }
  }
  let ary = {};
  ary.time = new Date();
  ary.type = 'info';
  ary.name = '';
  ary.text = '設定ファイルを読み込みました。';
  logProcess(ary);
  bouyomiAutoStart(); // 自動読み上げ
  debugLogStart(); // デバッグ
}
// ファイルへ書き込み
function writeFile(status) {
  let settingAry = {};
  $('#main_overlay form').each(function() {
    const id = $(this).attr('id');
    const radio = $(this).find('input:radio:checked').val();
    const text = $(this).find('input:text').val();
    const textarea = $(this).find('textarea');
    const val = (function() {
      if (radio != null) return Number(radio);
      if (text != null) return text;
      return '';
    })();
    settingAry[id] = val;
    if (textarea.length) {
      textarea.each(function() {
        const textareaVal = createArray($(this).val());
        const textareaName = $(this).attr('name');
        settingAry[textareaName] = textareaVal;
      });
    }
  });
  if (JSON.stringify(fileData) == JSON.stringify(settingAry)) return; // 設定に変化がない時
  fileData = settingAry; // 設定をグローバル変数へ
  console.log(settingAry);
  const res = ipcRenderer.sendSync('setting-file-write', settingAry);
  console.log(res);
  if (res === true) {
    // 設定の保存に成功
  } else if (/EPERM|EBUSY/.test(res)) {
    swal(
      '設定を保存できません',
      '設定ファイルを開いている場合は閉じてください。',
      'error'
    );
  } else if (/ENOENT/.test(res)) {
    // 設定ファイルが存在しない
  }
  debugLog(`setting ${status}`, settingAry);
}

//function modalAlert(text) {
//  if ($('#main_alert').hasClass('show')) return;
//  $('#main_alert p').text(text);
//  $('#main_alert').addClass('show').removeClass('hide');
//  setTimeout(function() {
//    $('#main_alert').addClass('hide').removeClass('show');
//  }, 2000);
//}
client.on('ready', () => {
  let ary = {};
  ary.time = new Date();
  ary.type = 'info';
  ary.name = '';
  ary.text = '読み上げを開始しました。';
  logProcess(ary);
  bouyomiProcess(ary);
});
client.on('reconnecting', () => {
  let ary = {};
  ary.time = new Date();
  ary.type = 'info';
  ary.name = '';
  ary.text = '再接続をします。';
  logProcess(ary);
});
// ボイスチャンネルに参加（マイク、スピーカーのON/OFFも）
client.on('voiceStateUpdate', message => {
  debugLog('voiceStateUpdate', message);
  const d_sv_voice = fileData.d_sv_voice;
  if (d_sv_voice == 1) return;
  const clientUserId = client.user.id; // 自分のID
  const messageUserId = message.id; // 参加者のID
  if (clientUserId == messageUserId) return; // 自分自身のイベント
  const messageGuildId = message.guild.id; // サーバのID
  const d_sv_sv_list = fileData.d_sv_sv_list; //$('#d_sv_sv_list input:checked').val();
  const d_sv_sv_list_b = fileData.d_sv_sv_list_b.join('\n'); //$('textarea[name=d_sv_sv_list_b]').val();
  const d_sv_sv_list_w = fileData.d_sv_sv_list_w.join('\n'); //$('textarea[name=d_sv_sv_list_w]').val();
  if (d_sv_sv_list == 0 && regularExpression(d_sv_sv_list_b).test(messageGuildId)) return; // ブラックリストにある時
  if (d_sv_sv_list == 1 && !regularExpression(d_sv_sv_list_w).test(messageGuildId)) return; // ホワイトリストにない時
  const d_sv_nick = fileData.d_sv_nick; //$('#d_sv_nick input:checked').val();
  const nickname = message.nickname;
  const username = (function() {
    if (d_sv_nick == 1 || nickname == null) return message.user.username; // d_sv_nickが無効の時、サーバで未設定のとき
    return nickname;
  })();
  const guildChannel = message.guild.channels; // サーバのチャンネル一覧
  // 切断チャンネル（参加時:undefined, 切断時:123456789012345678）
  const channelID = message.voiceChannelID;
  const channelName = guildChannel.map(function(value, index) {
    if (channelID == index) return value.name;
  }).filter(Boolean);
  // 参加チャンネル（参加時:123456789012345678, 切断時:null）
  const protoChannelID = message.__proto__.voiceChannelID;
  const protoChannelName = guildChannel.map(function(value, index) {
    if (protoChannelID == index) return value.name;
  }).filter(Boolean);
  // テキストの生成
  const text = (function() {
    if (channelID == null) return `${username}が「${protoChannelName}」に参加しました。`; // チャンネルへ参加
    if (protoChannelID == null) return `${username}が「${channelName}」から切断しました。`; // チャンネルから切断
    if (channelID != protoChannelID) return `${username}が「${channelName}」から「${protoChannelName}」へ移動しました。`; // チャンネルの移動
  })();
  let ary = {};
  ary.time = new Date();
  ary.type = 'info';
  ary.name = '';
  ary.text = text;
  // 処理
  if (channelID == protoChannelID) return;
  logProcess(ary);
  if (d_sv_voice == 0) bouyomiProcess(ary);
});
client.on('message', message => {
  debugLog('message', message);
  // Discord 基本設定
  const d_user = fileData.d_user; //$('#d_user input:checked').val();
  // Discord DM設定
  const d_dm = fileData.d_dm; //$('#d_dm input:checked').val();
  const d_dm_list = fileData.d_dm_list; //$('#d_dm_list input:checked').val();
  const d_dm_list_b = fileData.d_dm_list_b.join('\n'); //$('textarea[name=d_dm_list_b]').val();
  const d_dm_list_w = fileData.d_dm_list_w.join('\n'); //$('textarea[name=d_dm_list_w]').val();
  // Discord グループ設定
  const d_gr = fileData.d_gr; //$('#d_gr input:checked').val();
  const d_gr_list = fileData.d_gr_list; //$('#d_gr_list input:checked').val();
  const d_gr_list_b = fileData.d_gr_list_b.join('\n'); //$('textarea[name=d_gr_list_b]').val();
  const d_gr_list_w = fileData.d_gr_list_w.join('\n'); //$('textarea[name=d_gr_list_w]').val();
  // Discord サーバ設定
  const d_sv = fileData.d_sv; //$('#d_sv input:checked').val();
  const d_sv_nick = fileData.d_sv_nick; //$('#d_sv_nick input:checked').val();
  const d_sv_sv_list = fileData.d_sv_sv_list; //$('#d_sv_sv_list input:checked').val();
  const d_sv_sv_list_b = fileData.d_sv_sv_list_b.join('\n'); //$('textarea[name=d_sv_sv_list_b]').val();
  const d_sv_sv_list_w = fileData.d_sv_sv_list_w.join('\n'); //$('textarea[name=d_sv_sv_list_w]').val();
  const d_sv_ch_list = fileData.d_sv_ch_list; //$('#d_sv_ch_list input:checked').val();
  const d_sv_ch_list_b = fileData.d_sv_ch_list_b.join('\n'); //$('textarea[name=d_sv_ch_list_b]').val();
  const d_sv_ch_list_w = fileData.d_sv_ch_list_w.join('\n'); //$('textarea[name=d_sv_ch_list_w]').val();
  // 自身の通知を読むか
  const user_id = client.user.id;
  const authorId = message.author.id;
  if (d_user == 1 && user_id == authorId) return;
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
  const channelType = message.channel.type;
  if (channelType == 'dm' && d_dm == 1 || channelType == 'group' && d_gr == 1 || channelType == 'text' && d_sv == 1) return;
  // ホワイトリスト・ブラックリストの処理
  // 1.  DMかグループかサーバを確認        channelType
  // 2.  リスト設定がどっちかを確認        d_dm_list,   d_sv_sv_list,   d_sv_ch_list   0ブラックリスト, 1ホワイトリスト
  // 3-1.ブラックリストのIDならreturn      d_dm_list_b, d_sv_sv_list_b, d_sv_ch_list_b
  // 3-2.ホワイトリスト以外のIDならreturn  d_dm_list_w, d_sv_sv_list_w, d_sv_ch_list_w
  if (channelType == 'dm') {
    const dmUserId = message.channel.recipient.id;
    if (
      d_dm_list == 0 && regularExpression(d_dm_list_b).test(dmUserId) ||
      d_dm_list == 1 && !regularExpression(d_dm_list_w).test(dmUserId)
    ) return;
  } else if (channelType == 'group') {
    const grUserId = message.channel.id;
    if (
      d_gr_list == 0 && regularExpression(d_gr_list_b).test(grUserId) ||
      d_gr_list == 1 && !regularExpression(d_gr_list_w).test(grUserId)
    ) return;
  } else if (channelType == 'text') {
    const svServerId = message.channel.guild.id;
    const svChannelId = message.channel.id;
    if (
      d_sv_sv_list == 0 && regularExpression(d_sv_sv_list_b).test(svServerId) ||
      d_sv_sv_list == 1 && !regularExpression(d_sv_sv_list_w).test(svServerId) ||
      d_sv_ch_list == 0 && regularExpression(d_sv_ch_list_b).test(svChannelId) ||
      d_sv_ch_list == 1 && !regularExpression(d_sv_ch_list_w).test(svChannelId)
    ) return;
  }
  // 名前の処理
  const nickname = (function() {
    if (channelType == 'text' && message.member != null) return message.member.nickname;
    return '';
  })();
  const username = (function() {
    // d_sv_nickが無効の時、DMの時、グループの時、nicknameが無いとき(DM)、サーバで未設定のとき
    if (d_sv_nick == 1 || channelType == 'dm' || channelType == 'group' || nickname == '' || nickname == null) return message.author.username;
    return nickname;
  })();
  // サーバー名
  const guildName = (function() {
    if (channelType == 'dm') return 'dm';
    if (channelType == 'group') return 'group';
    return message.channel.guild.name;
  })();
  // チャットの内容 (リプライ/チャンネルタグを読ませない)
  const content = message.content.replace(/<@!?[0-9]+>/g, '').replace(/<#[0-9]+>/g, '');
  // 画像オンリー、スペースのみを読ませない
  if (content == '' || /^([\s]+)$/.test(content)) return;
  // チャットの時間
  const utc = message.createdTimestamp; // UTC
  const jst = utc + (60 * 60 * 9); // +9hour
  const time = new Date(jst);
  let ary = {};
  ary.time = time;
  ary.type = guildName;
  ary.name = username;
  ary.text = content;
  // 処理
  logProcess(ary);
  bouyomiProcess(ary);
});
// エラーが起きたときの処理
//client.on('debug', (message) => {
//  errorLog('debug', message);
//});
client.on('error', (message) => {
  errorLog('error', message);
});
client.on('warn', (message) => {
  errorLog('warn', message);
});
process.on('uncaughtException', (message) => {
  errorLog('uncaughtException', message);
});
process.on('unhandledRejection', (message) => {
  errorLog('unhandledRejection', message);
});
// エラーをログへ書き出す
function errorLog(fnc, error) {
  const errorStr = (function() {
    if (toString.call(error) == '[object Event]') return JSON.stringify(error);
    return String(error);
  })();
  if (errorStr.match(/Error: Cannot find module '\.\.\/setting\.json'/)) return;
  const errorMess = (function() {
    if (errorStr.match(/{"isTrusted":true}/)) return 'インターネットに接続できません。再接続をします。';
    if (errorStr.match(/TypeError: Failed to fetch/)) return 'インターネットに接続できません。';
    if (errorStr.match(/Error: Something took too long to do/)) return 'Discordに接続できません。';
    if (errorStr.match(/Error: connect ECONNREFUSED/)) return '棒読みちゃんが起動していない、もしくは接続できません。';
    if (errorStr.match(/Error: getaddrinfo ENOTFOUND/)) return 'IPが正しくありません。';
    if (errorStr.match(/RangeError: "port" option should be/)) return 'ポートが正しくありません。';
    if (errorStr.match(/Error: Incorrect login details were provided/)) return 'トークンが正しくありません。';
    if (errorStr.match(/Error: Uncaught, unspecified "error" event/)) return 'エラーが発生しました。';
    if (errorStr.match(/Error: The token is not filled in/)) return 'トークンが記入されていません。';
    if (errorStr.match(/ReferenceError: ([\s\S]*?) is not defined/)) return `変数 ${errorStr.split(' ')[1]} が定義されていません。@micelle9までご連絡ください。`;
    return `不明なエラーが発生しました。（${errorStr}）`;
  })();
  let ary = {};
  ary.time = new Date();
  ary.type = 'error';
  ary.name = '';
  ary.text = errorMess;
  logProcess(ary);
  debugLog(fnc, error);
}
// デバッグ用
function debugLogStart() {
  const fnc = 'start';
  const txt = 'Start debug mode.';
  debugLog(fnc, txt);
  debugLog('src', srcDirectory);
  //debugLog('exe', exeDirectory);
  debugLog('DiSpeak', `v${nowVersion}`);
  debugLog('jQuery', `v${jQueryVersion}`);
}

function debugLog(fnc, txt) {
  if (fileData.s_debug != 0) return;
  const time = new Date();
  const hour = toDoubleDigits(time.getHours());
  const min = toDoubleDigits(time.getMinutes());
  const sec = toDoubleDigits(time.getSeconds());
  const txtCall = toString.call(txt);
  const txtStr = (function() {
    if (txtCall == '[object Event]') return JSON.stringify(txt);
    return String(txt);
  })();
  console.groupCollapsed(`${hour}:${min}:${sec} %s`, fnc);
  console.log(txtCall);
  console.log(txtStr);
  console.log(txt);
  console.groupEnd();
}