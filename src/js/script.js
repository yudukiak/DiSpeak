'use strict';
const {ipcRenderer} = require('electron');
const Discord = require('discord.js');
const $ = require('jquery');
const srcDirectory = ipcRenderer.sendSync('directory-app-check').replace(/\\/g, '/');
const nowVersion = ipcRenderer.sendSync('now-version-check');
const bouyomiConnect = require(`${srcDirectory}/js/bouyomiConnect.js`);
const client = new Discord.Client();
const jQueryVersion = $.fn.jquery;

// 設定ファイルを読み込む
let setting = ipcRenderer.sendSync('setting-file-read');

// デバッグログ
debugLog('[info] DiSpeak', `v${nowVersion}`);
debugLog('[info] jQuery', `v${jQueryVersion}`);

$(function() {
  // materializeの処理
  M.AutoInit();
  // 設定ファイルが存在しないとき（初回起動時）
  if (setting == null) {
    writeFile();
  }
  // 設定ファイルが存在するとき
  else {
    M.toast({
      html: '設定ファイルを読み込みました',
      classes: 'toast-load',
      //displayLength:'stay',
    });
    // ログインの処理
    loginDiscord(setting.discord.token);
    M.Chips.init($('.chips'), {
      placeholder: 'ユーザーのIDを記入し、エンターで追加できます',
      secondaryPlaceholder: '+ ユーザーのIDを追加する',
      data: setting.blacklist,
      onChipAdd: function() {
        const instance = M.Chips.getInstance($('.chips'));
        const ary = instance.chipsData;
        const aryLen = ary.length - 1;
        const lastAry = ary[aryLen];
        const lastTag = lastAry.tag;
        const lastImg = lastAry.image;
        if (lastImg != null) return;
        // ここあとで作ります…（仮の関数置いてます）
        setTimeout(function() {
          instance.deleteChip(aryLen);
          instance.addChip({
            tag: `ユーザー (${lastTag})`,
            image: 'images/discord.png'
          });
          setTimeout(function() {
            console.log(`aryLen:${aryLen} / lastTag:${lastTag}`);
            writeFile();
          }, 500);
        }, 100);
      },
    });
  }
  // NGユーザー 入力制限（数字以外を削除）
  $(document).on('blur input keyup', '#blacklist input', function() {
    const val = $(this).val();
    $(this).val(val.replace(/[^0-9]/g, ''));
  });
  // オートセーブ
  $(document).on('blur click change focusout input keyup mouseup', 'textarea, input', function() {
    writeFile();
  });
  // ヘッダー
  $(document).on('click', 'header > div', function() {
    const id = $(this).attr('id');
    if (id != null) ipcRenderer.send(id);
  });
  // タブ切り替え時に再生ボタンを表示・非表示
  $(document).on('click', '.tabs li', function() {
    const index = $('.tabs li').index(this);
    if (index == 0) $('.fixed-action-btn').css('display', 'block');
    if (index == 1) $('.fixed-action-btn').css('display', 'none');
  });
  // 設定リストの切り替え
  $(document).on('click', '#setting_menu li', function() {
    const index = $('#setting_menu li').index(this);
    $('#setting_table > div').css('display', 'none');
    $('#setting_table > div').eq(index).css('display', 'block');
    $('#setting_menu li').removeClass('active blue');
    $(this).addClass('active blue');
  });
  // 再生・停止
  $(document).on('click', '.fixed-action-btn a', function() {
    if ($('.toast-bouyomi').length) return;
    // 既にログインしていた場合
    if (login) {
      $(this).css('display', 'none');
      $(this).siblings().css('display', 'block');
      const id = $(this).attr('id');
      if (id == 'start') {
        M.toast({
          html: '再生を開始しています…',
          classes: 'toast-bouyomi',
        });
      } else if (id == 'stop') {
        M.toast({
          html: '再生を停止しました',
          classes: 'toast-bouyomi',
        });
      }
    }
    // まだログインしていない場合
    else {
      M.toast({
        html: 'Discordにログインをしてください',
        classes: 'toast-bouyomi',
      });
    }
  });
  // ログイン・ログアウト
  $(document).on('click', '#offline, #online', function() {
    if ($('.toast-discord').length) return;
    const id = $(this).attr('id');
    const token = setting.discord.token;
    // ログイン時
    if (id == 'offline') {
      // トークンがないとき
      if (token == null || token == '') {
        M.toast({
          html: 'トークンを入力してください',
          classes: 'toast-discord'
        });
      }
      // トークンがあるとき
      else {
        loginDiscord(token);
      }
    } else {
      M.toast({
        html: 'ログイン済みです',
        classes: 'toast-discord'
      });
    }
  });
  // 棒読み
  $(document).on('click', '#bouyomi button', function() {
    const bouyomiDir = ipcRenderer.sendSync('bouyomi-dir-dialog');
    if (bouyomiDir == '') {
      M.toast({
        html: '実行ファイルが選択されていません<br>BouyomiChan.exeを選択してください',
        classes: 'toast-exe'
      });
    } else if (!/BouyomiChan\.exe/.test(bouyomiDir)) {
      M.toast({
        html: '実行ファイルが異なります<br>BouyomiChan.exeを選択してください',
        classes: 'toast-exe'
      });
    } else {
      $('#bouyomi input[name=dir]').val(bouyomiDir);
      M.updateTextFields();
      writeFile();
    }
  });
});

// Discord
client.on('ready', function() {
  debugLog('[Discord] ready', client);
  $('#offline').css('display', 'none');
  $('#online').css('display', 'inline-block');
  M.toast({
    html: 'ログインに成功しました',
    classes: 'toast-discord'
  });
  // アカウント
  const user = client.user;
  const avatarURL = (function() {
    if (user.avatarURL != null) return user.avatarURL.replace(/\?size=\d+/, '');
    return user.defaultAvatarURL;
  })();
  const username = user.username;
  const discriminator = user.discriminator;
  $('#discord-profile img').attr('src', avatarURL);
  $('#discord-profile p').eq(1).text(`${username}#${discriminator}`);
  // 各チャンネル
  let serverObj = {};
  client.channels.map(function(val, key) {
    // ダイレクトメッセージ
    if (val.type == 'dm') {
      const avatarURL = (function() {
        if (val.recipient.avatarURL == null) return val.recipient.defaultAvatarURL;
        return val.recipient.avatarURL.replace(/\?size=\d+/, '');
      })();
      const name = val.recipient.username;
      const id = val.recipient.id;
      const discriminator = val.recipient.discriminator;
      $('#directmessage-list').append(
        '<div class="collection-item avatar valign-wrapper">' +
        `<div class="col s9 valign-wrapper"><img src="${avatarURL}" alt="" class="circle"><span class="title">${name}#${discriminator}</span></div>` +
        `<div class="col s3 switch right-align"><label><input name="${id}" type="checkbox" checked><span class="lever"></span></label></div>` +
        '</div>'
      );
    }
    // グループダイレクトメッセージ
    else if (val.type == 'group') {
      const iconURL = (function() {
        if (val.iconURL == null) return 'images/group.svg';
        return val.iconURL.replace(/\?size=\d+/, '');
      })();
      const name = val.recipients.map(function(v) {
        return v.username
      }).join(', ');
      $('#group-list').append(
        '<div class="collection-item avatar valign-wrapper">' +
        `<div class="col s9 valign-wrapper"><img src="${iconURL}" alt="" class="circle"><span class="title">${name}</span></div>` +
        `<div class="col s3 switch right-align"><label><input name="${key}" type="checkbox" checked><span class="lever"></span></label></div>` +
        '</div>'
      );
    }
    // サーバーのテキストチャンネル
    else if (val.type == 'text') {
      const c_id = key;
      const c_name = val.name;
      const s_id = val.guild.id;
      const s_name = val.guild.name;
      const s_iconURL = (function() {
        if (val.guild.iconURL == null) return 'images/group.svg';
        return val.guild.iconURL.replace(/\?size=\d+/, '');
      })();
      if (serverObj[s_id] == null) serverObj[s_id] = {
        'name': s_name,
        'iconURL': s_iconURL,
        'channels': []
      };
      serverObj[s_id].channels.push({
        'name': c_name,
        'id': c_id
      });
    }
  });
  for (let id in serverObj) {
    const name = serverObj[id].name;
    const iconURL = serverObj[id].iconURL;
    const channels = serverObj[id].channels;
    let html =
      `<div id="${id}" class="collection-item row">` +
      `<div class="collection-item avatar valign-wrapper"><img src="${iconURL}" alt="" class="circle"><span class="title">${name}</span></div>` +
      '<div class="col s12 row section right-align">' +
      '<div class="col s6 valign-wrapper"><div class="col s9"><strong>チャットの読み上げ</strong></div><div class="col s3 switch right-align"><label><input name="chat" type="checkbox"><span class="lever"></span></label></div></div>' +
      '<div class="col s6 valign-wrapper"><div class="col s9"><strong>ボイスチャンネルの通知</strong></div><div class="col s3 switch right-align"><label><input name="voice" type="checkbox"><span class="lever"></span></label></div></div>' +
      '</div><div class="col s12 row section right-align">';
    for (let i = 0, l = channels.length; i < l; i++) {
      const channelId = channels[i].id;
      const channelName = channels[i].name;
      html += `<div class="col s6 valign-wrapper"><div class="col s9">${channelName}</div><div class="col s3 switch right-align"><label><input name="${channelId}" type="checkbox" checked><span class="lever"></span></label></div></div>`;
    }
    html += '</div></div>';
    $('#server-list').append(html);
  }
  // 設定ファイルを反映
  readFile();
});

// ------------------------------
// 各種関数
// ------------------------------
// ファイルを表示
function readFile() {
  for (let id in setting) {
    const data = setting[id];
    for (let name in data) {
      const val = data[name];
      const type = toString.call(val);
      // オブジェクト（serverのみ）
      if (/object Object/.test(type) && /server/.test(id)) {
        for (let serverName in val) {
          const serverVal = val[serverName];
          $(`#${name} input[name=${serverName}]`).prop('checked', serverVal);
        }
      }
      // チェックボックス
      else if (/object Boolean/.test(type)) {
        $(`#${id} input[name=${name}]`).prop('checked', val);
      }
      // それ以外
      else {
        $(`#${id} input[name=${name}]`).val(val);
      }
    }
  }
  if ($('.toast-readFile').length) return;
  M.toast({
    html: '設定を反映しました',
    classes: 'toast-readFile',
    //displayLength:'stay',
  });
  M.updateTextFields();
  debugLog('[readFile] obj', setting);
}
// ファイルへ書き込み
function writeFile() {
  let setting_AutoSave = {};
  $('#dispeak, #discord, #directmessage, #group, #bouyomi, #server .input-field.col.s9, #server .collection-item.row').each(function() {
    const divId = $(this).attr('id');
    const id = (function() {
      if (divId == null) return 'server';
      return divId;
    })();
    let parentObj = {};
    let inputObj = {};
    $(this).find('input').each(function() {
      const input = $(this);
      const name = input.attr('name');
      const val = (function() {
        if (input.attr('type') == 'checkbox') return input.prop('checked');
        return input.val();
      })();
      inputObj[name] = val;
    });
    parentObj[id] = inputObj;
    if (!/\d+/.test(id)) {
      $.extend(true, setting_AutoSave, parentObj);
    } else {
      $.extend(true, setting_AutoSave.server, parentObj);
    }
  });
  setting_AutoSave.blacklist = M.Chips.getInstance($('.chips')).chipsData;
  if (JSON.stringify(setting) == JSON.stringify(setting_AutoSave)) return;
  setting = $.extend(true, {}, setting_AutoSave);
  const res = ipcRenderer.sendSync('setting-file-write', setting_AutoSave);
  // 保存に成功
  if (res === true) {}
  // 保存に失敗
  else if (/EPERM|EBUSY/.test(res)) {
    if ($('.toast-writeFile').length) return;
    M.toast({
      html: '設定を保存できません<br>設定ファイルを開いている場合は閉じてください',
      classes: 'toast-writeFile',
      //displayLength:'stay',
    });
  }
  // ファイルが存在しない
  else if (/ENOENT/.test(res)) {}
  debugLog('[writeFile] obj', setting_AutoSave);
  debugLog('[writeFile] res', res);
}
// ログイン
function loginDiscord(token) {
  if (token == null || token == '') return;
  M.toast({
    html: 'ログインを開始しています',
    classes: 'toast-discord'
  });
  // 成功したらclient.on('ready')の処理が走る
  client.login(token).catch(function(error) {
    M.toast({
      html: `ログインに失敗しました<br>${error}`,
      classes: 'toast-discord'
    });
  });
}
// ゼロパディング
function zeroPadding(num) {
  const str = String(num);
  const txt = (function() {
    if (str.length == 1) return `0${str}`;
    return str;
  })();
  return txt;
}
// エスケープ
function escapeHtml(str) {
  const rep = str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  return rep;
}
// デバッグ
function debugLog(fnc, data) {
  if (setting == null || setting.dispeak.debug == false) return;
  const time = new Date();
  const hour = zeroPadding(time.getHours());
  const min = zeroPadding(time.getMinutes());
  const sec = zeroPadding(time.getSeconds());
  const type = toString.call(data);
  const text = (function() {
    if (/Discord/.test(fnc)) return '';
    if (/object (Event|Object)/.test(type)) return JSON.stringify(data);
    return String(data);
  })();
  console.groupCollapsed(`${hour}:${min}:${sec} %s`, fnc);
  console.log('type:', type);
  console.log('text:', text);
  console.log('data:', data);
  console.groupEnd();
}