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
// 多重動作を防ぐ為の変数
let loginDiscordCheck = false; // Discordは f:未ログイン, t:ログイン
let bouyomiSpeakCheck = false; // 棒読みちゃんは f:読み上げない, t:読み上げる
let bouyomiExeStartCheck = false; // 棒読みちゃんは f:起動してない, t:起動している

$(function() {
  // materializeの処理
  M.AutoInit();
  M.Chips.init($('.chips'), {
    placeholder: 'ユーザーのIDを記入し、エンターで追加できます',
    secondaryPlaceholder: '+ ユーザーのIDを追加する',
    data: (function() {
      if (setting == null) return [];
      return setting.blacklist; // メモ 正規表現は/\((\d+)\)$/
    })(),
    onChipAdd: function() {
      const instance = M.Chips.getInstance($('.chips'));
      const ary = instance.chipsData;
      const aryLen = ary.length - 1;
      const lastAry = ary[aryLen];
      const lastTag = lastAry.tag;
      const lastImg = lastAry.image;
      if (setting == null || !loginDiscordCheck) {
        instance.deleteChip(aryLen);
        M.toast({
          html: 'Discordにログインをしてください',
          classes: 'toast-chips'
        });
      } else if (lastImg == null) {
        const userData = client.users.get(lastTag);
        const userName = userData.username;
        const userDiscriminator = userData.discriminator;
        const useAvatarURL = (function() {
          if (userData.avatarURL == null) return userData.defaultAvatarURL;
          return userData.avatarURL.replace(/\?size=\d+/, '');
        })();
        instance.deleteChip(aryLen);
        instance.addChip({
          tag: `${userName}#${userDiscriminator} (${lastTag})`,
          image: useAvatarURL
        });
        // 少し時間差を置いてファイルへ書き込みさせます。ダサい実装なので調整したい
        setTimeout(function() {
          writeFile();
          debugLog('[Discord] onChipAdd', userData);
        }, 100);
      }
    }
  });
  // デフォルトのテンプレートを反映
  $('#directmessage .template, #group .template, #server .template').each(function() {
    const data = $(this).data('template');
    $(this).find('input').val(data);
    M.updateTextFields();
  });
  // 設定ファイルが存在しないとき（初回起動時）
  if (setting == null) {
    writeFile();
  }
  // 古い設定ファイルを使用しているとき
  else if (setting.version == null) {
    M.toast({
      html: 'v2.0未満の設定ファイルです<br>設定の読み込みを中止しました',
      classes: 'toast-load'
    });
  }
  // 設定ファイルが存在するとき
  else {
    // デバッグログ
    debugLog('[info] DiSpeak', `v${nowVersion}`);
    debugLog('[info] jQuery', `v${jQueryVersion}`);
    // ログインの処理
    loginDiscord(setting.discord.token);
  }
  // Discordのトークン 入力制限（半角英数字記号以外を削除）
  $(document).on('blur', '#discord input', function() {
    const val = $(this).val();
    $(this).val(val.replace(/[^a-zA-Z0-9!-/:-@¥[-`{-~]/g, '').replace(/"/g, ''));
  });
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
    if (loginDiscordCheck) {
      $(this).css('display', 'none');
      $(this).siblings().css('display', 'block');
      const id = $(this).attr('id');
      if (id == 'start') {
        bouyomiSpeakCheck = true; // 読み上げる状態に変更
        M.toast({
          html: '再生を開始しています…',
          classes: 'toast-bouyomi'
        });
        bouyomiExeStart();
      } else if (id == 'stop') {
        bouyomiSpeakCheck = false; // 読み上げない状態に変更
        M.toast({
          html: '再生を停止しました',
          classes: 'toast-bouyomi'
        });
      }
    }
    // まだログインしていない場合
    else {
      M.toast({
        html: 'Discordにログインをしてください',
        classes: 'toast-bouyomi'
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
        html: 'ログイン済みです<br>ログアウトする場合は設定ファイルを削除してください',
        classes: 'toast-discord'
      });
    }
  });
  // テンプレートのリセット
  $(document).on('click', '#directmessage .template button, #group .template button, #server .template button', function() {
    const data = $(this).parents('.template').data('template');
    $(this).parents('.template').find('input').val(data);
    M.updateTextFields();
    writeFile();
  });
  // 棒読み
  $(document).on('click', '#bouyomi button', function() {
    if ($('.toast-exe').length) return;
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

// ------------------------------
// Discord
// ------------------------------
// ログイン時
client.on('ready', function() {
  debugLog('[Discord] ready', client);
  loginDiscordCheck = true; // ログインしたのでtrueへ変更
  M.Modal.init($('.modal'));
  M.Modal.getInstance($('#modal_discord')).close();
  $('#offline').css('display', 'none');
  $('#online').css('display', 'inline-block');
  M.toast({
    html: 'Discordのログインに成功しました',
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
  const loginTime = whatTimeIsIt();
  const loginHtml = `${loginTime} [info] <br>Discordのログインに成功しました`;
  logProcess(loginHtml, avatarURL);
  // 各チャンネル
  let serverObj = {}; // サーバーの処理を考える
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
// 再接続時
client.on('reconnecting', function() {
  if ($('.toast-reconnecting').length) return;
  M.toast({
    html: '再接続をします',
    classes: 'toast-reconnecting'
  });
});
// ボイスチャンネルに参加（マイク、スピーカーのON/OFFも）
client.on('voiceStateUpdate', function(data) {
  debugLog('[Discord] voiceStateUpdate', data);
  //if (!bouyomiSpeakCheck || !bouyomiExeStartCheck) return; // 棒読みちゃんの読み上げが始まっていないときは処理しない
  if (client.user.id == data.id) return; // 自分自身のイベントは処理しない
  const guildId = data.guild.id; // サーバのID
  const voice = setting.server[guildId].voice; // settingのtrueもしくはfalseを取得
  if (!voice) return; // falseのとき読まない
  const guildChannel = data.guild.channels; // サーバのチャンネル一覧を取得
  // 切断チャンネル（参加時:undefined, 切断時:123456789012345678）
  const channelPrevID = data.voiceChannelID;
  const channelPrevName = (function() {
    const channelPrevData = guildChannel.get(channelPrevID);
    if (channelPrevData == null) return '';
    return channelPrevData.name;
  })();
  // 参加チャンネル（参加時:123456789012345678, 切断時:null）
  const channelNextID = data.__proto__.voiceChannelID;
  const channelNextName = (function() {
    const channelNextData = guildChannel.get(channelNextID);
    if (channelNextData == null) return '';
    return channelNextData.name;
  })();
  // テキストの生成
  const time = whatTimeIsIt(); // 現在の時刻
  const guildName = data.guild.name; // 対象サーバーの名前
  const username = data.user.username; // 対象者の名前
  const nickname = (function() { // 対象者のニックネーム。未設定はnull
    if (data.nickname == null) return username;
    return data.nickname;
  })();
  const vcSettingAry = (function() {
    if (channelPrevID == null) return [channelNextName, setting.server.template_bym_vc_in, setting.server.template_log_vc_in]; // チャンネルへ参加
    if (channelNextID == null) return [channelPrevName, setting.server.template_bym_vc_out, setting.server.template_log_vc_out]; // チャンネルから切断
    if (channelPrevID != channelNextID) return ['', setting.server.template_bym_vc_change, setting.server.template_log_vc_change]; // チャンネルの移動
  })();
  if (vcSettingAry == null) return; // 参加・移動・退出以外の場合は処理を終了
  const channelName = vcSettingAry[0];
  const template_bym = vcSettingAry[1];
  const template_log = vcSettingAry[2];
  const note = (function() {
    if (data.user.note == null) return '';
    return data.user.note;
  })();
  const avatarURL = (function() {
    if (data.user.avatarURL == null) return data.user.defaultAvatarURL;
    return data.user.avatarURL.replace(/\?size=\d+/, '');
  })();
  const template_bymRep = template_bym
    .replace(/\$time\$/, time).replace(/\$server\$/, guildName).replace(/\$channel\$/, channelName)
    .replace(/\$channel-prev\$/, channelPrevName).replace(/\$channel-next\$/, channelNextName)
    .replace(/\$username\$/, username).replace(/\$nickname\$/, nickname).replace(/\$memo\$/, note);
  const template_logRep = template_log
    .replace(/\$time\$/, time).replace(/\$server\$/, guildName).replace(/\$channel\$/, channelName)
    .replace(/\$channel-prev\$/, channelPrevName).replace(/\$channel-next\$/, channelNextName)
    .replace(/\$username\$/, username).replace(/\$nickname\$/, nickname).replace(/\$memo\$/, note);
  bouyomiSpeak(template_bymRep);
  logProcess(template_logRep, avatarURL);
});
// チャットが送信された時
client.on('message', function(data) {
  debugLog('[Discord] message', data);
  //if (!bouyomiSpeakCheck || !bouyomiExeStartCheck) return; // 棒読みちゃんの読み上げが始まっていないときは処理しない
  const userId = client.user.id; // 自分のID
  const authorId = data.author.id; // チャットユーザーのID
  const settingMyChat = setting.dispeak.my_chat;
  const settingOtherChat = setting.dispeak.other_chat;
  if (userId == authorId && !settingMyChat) return; // 自分が発言したとき、読み上げない設定の場合は処理を行わない
  if (userId != authorId && !settingOtherChat) return; // 他人が発言したとき、読み上げない設定の場合は処理を行わない
  const channelType = (function() { // チャンネルごとに判定
    const channel = data.channel.type;
    if (channel == 'dm') return 'directmessage';
    if (channel == 'group') return 'group';
    if (channel == 'text') return 'server';
  })();
  const channelId = data.channel.id;
  const guildId = (function() {
    if (channelType == 'server') return data.channel.guild.id;
    return '';
  })();
  if (
    channelType == 'directmessage' && !setting.directmessage[authorId] // 特定のDMを読み上げない時
    && setting.directmessage[authorId] != null // settingに無い場合はスルー（主に自分のチャット）
    || channelType == 'group' && setting.group[channelId] == null // settingに無い場合は処理させない
    || channelType == 'group' && !setting.group[channelId] // 特定のグループDMを読み上げない時
    || channelType == 'server' && setting.server[guildId].chat == null // settingに無い場合は処理させない
    || channelType == 'server' && !setting.server[guildId].chat // 特定のサーバーを読み上げない時
    || channelType == 'server' && setting.server[guildId][channelId] == null // settingに無い場合は処理させない
    || channelType == 'server' && !setting.server[guildId][channelId] // 特定のサーバーのチャンネルを読み上げない時
  ) return;
  // ここにブラックリストの処理を書きます

  // テキストの生成
  const template_bym = setting[channelType].template_bym;
  const template_log = setting[channelType].template_log;
  const time = whatTimeIsIt(); // 現在の時刻
  const guildName = (function() { // 対象サーバーの名前
    if (channelType == 'server') return data.channel.guild.name;
    return '';
  })();
  const channelName = (function() { // 対象チャンネルの名前
    if (channelType == 'server') return data.channel.name;
    return '';
  })();
  const groupName = (function() { // グループ名を作成
    if (channelType != 'group') return '';
    const obj = data.channel.recipients.map(function(v) {
      return v.username;
    }).join(', ');
    return obj;
  })();
  const username = data.author.username; // 対象者の名前
  const nickname = (function() { // 対象者のニックネーム。未設定はnull
    if (data.member == null || data.member.nickname == null) return username;
    return data.member.nickname;
  })();
  const note = (function() {
    if (data.author.note == null) return '';
    return data.author.note;
  })();
  const avatarURL = (function() {
    if (data.author.avatarURL == null) return data.author.defaultAvatarURL;
    return data.author.avatarURL.replace(/\?size=\d+/, '');
  })();
  // チャットの内容 (リプライ/チャンネルタグを読ませない)
  const content = data.content.replace(/<@!?[0-9]+>/g, '').replace(/<#[0-9]+>/g, '');
  // 画像オンリー、スペースのみを読ませない
  if (content == '' || /^([\s]+)$/.test(content)) return;
  // チャットをエスケープ処理する
  const contentEsc = escapeHtml(content);
  // 絵文字の処理をする
  const contentEscRep = contentEsc
    .replace(/&lt;(:[0-9a-zA-Z]+:)([0-9]+)&gt;/g, '<img class="emoji" src="https://cdn.discordapp.com/emojis/$2.png" alt="$1" draggable="false">')
    .replace(/&lt;a(:[0-9a-zA-Z]+:)([0-9]+)&gt;/g, '<img class="emoji" src="https://cdn.discordapp.com/emojis/$2.gif" alt="$1" draggable="false">');
  // テンプレートにはめ込み
  // $time$ $server$ $channel$ $group$ $channel-prev$ $channel-next$ $username$ $nickname$ $memo$ $text$
  const template_bymRep = template_bym
    .replace(/\$time\$/, time).replace(/\$server\$/, guildName).replace(/\$channel\$/, channelName).replace(/\$group\$/, groupName)
    //.replace(/\$channel-prev\$/, channelPrevName).replace(/\$channel-next\$/, channelNextName)
    .replace(/\$username\$/, username).replace(/\$nickname\$/, nickname).replace(/\$memo\$/, note).replace(/\$text\$/, content);
  const template_logRep = template_log
    .replace(/\$time\$/, time).replace(/\$server\$/, guildName).replace(/\$channel\$/, channelName).replace(/\$group\$/, groupName)
    //.replace(/\$channel-prev\$/, channelPrevName).replace(/\$channel-next\$/, channelNextName)
    .replace(/\$username\$/, username).replace(/\$nickname\$/, nickname).replace(/\$memo\$/, note).replace(/\$text\$/, contentEscRep);
  bouyomiSpeak(template_bymRep);
  logProcess(template_logRep, avatarURL);
});
// WebSocketに接続エラーが起きたときの処理
client.on('error', function(data) {
  errorLog('[Discord] error', data);
});
// 警告があった際の処理
client.on('warn', function(data) {
  errorLog('[Discord] warn', data);
});

// ------------------------------
// 各種エラーをキャッチ
// ------------------------------
process.on('uncaughtException', function(message) {
  errorLog('[Error] uncaughtException', message);
});
process.on('unhandledRejection', function(message) {
  errorLog('[Error] unhandledRejection', message);
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
  M.updateTextFields();
  debugLog('[readFile] obj', setting);
}
// ファイルへ書き込み
function writeFile() {
  let setting_AutoSave = {};
  $('#dispeak, #discord, #directmessage, #group, #bouyomi, #server .template, #server-list > div').each(function() {
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
  setting_AutoSave.version = nowVersion;
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
      classes: 'toast-writeFile'
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
  debugLog('[loginDiscord] token', token);
  M.Modal.init($('.modal'), {
    dismissible: false
  });
  M.Modal.getInstance($('#modal_discord')).open();
  // 成功したらclient.on('ready')の処理が走る
  client.login(token).catch(function(error) {
    M.Modal.init($('.modal'));
    M.Modal.getInstance($('#modal_discord')).close();
    M.toast({
      html: `ログインに失敗しました<br>${error}`,
      classes: 'toast-discord'
    });
  });
}
// 棒読みちゃん起動
function bouyomiExeStart() {
  debugLog('[bouyomiExeStart] check', bouyomiExeStartCheck);
  const bouyomiDir = setting.bouyomi.dir;
  // 起動していない（false）場合のみ処理する
  if (!bouyomiExeStartCheck) {
    if (bouyomiDir == '' || !/BouyomiChan\.exe/.test(bouyomiDir)) return;
    const res = ipcRenderer.sendSync('bouyomi-exe-start', bouyomiDir);
    debugLog('[bouyomiExeStart] ipcRenderer', res);
    bouyomiExeStartCheck = res; // true:起動成功, false:起動失敗
  }
  // 棒読みちゃんに起動した旨を読ませる
  if (bouyomiExeStartCheck) {
    const data = '読み上げを開始しました';
    // 少し時間差を置いて読ませる。ダサい実装なので調整したい
    setTimeout(function() {
      bouyomiSpeak(data);
    }, 3000);
  } else {
    bouyomiSpeakCheck = false; // 読み上げない状態に変更
    $('#stop').css('display', 'none');
    $('#start').css('display', 'block');
    M.toast({
      html: `棒読みちゃんを起動できませんでした<br>ディレクトリを間違えていないかご確認ください<br>${bouyomiDir}`,
      classes: 'toast-bouyomiExe'
    });
  }
};
// 棒読みちゃんにdataを渡す
function bouyomiSpeak(data) {
  debugLog('[bouyomiSpeak] data', data);
  if (!bouyomiSpeakCheck || !bouyomiExeStartCheck) return;
  const bouyomiServer = {};
  bouyomiServer.host = setting.bouyomi.ip;
  bouyomiServer.port = setting.bouyomi.port;
  bouyomiConnect.sendBouyomi(bouyomiServer, data);
};
// ログを書き出す
function logProcess(html, image) {
  debugLog('[logProcess] html', html);
  $('#log .collection').prepend(`<li class="collection-item avatar valign-wrapper"><img src="${image}" class="circle"><p>${html}</p></li>`);
  // ログの削除
  const logDom = $('#log .collection li');
  const maxLine = 50; // 表示される最大行数
  if (logDom.length > maxLine) { // 行数を超えたら古いログを削除
    for (let i = maxLine, n = logDom.length; i < n; i++) {
      logDom[i].remove();
    }
  }
}
// 現在の時刻を取得
function whatTimeIsIt() {
  const time = new Date();
  const year = time.getFullYear();
  const month = zeroPadding(time.getMonth() + 1);
  const day = zeroPadding(time.getDate());
  const hours = zeroPadding(time.getHours());
  const minutes = zeroPadding(time.getMinutes());
  const text = `${year}/${month}/${day} ${hours}:${minutes}`;
  return text;
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
// エラーをログへ書き出す
function errorLog(fnc, error) {
  debugLog(fnc, error);
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
  if ($('toast-error').length > 6) return;
  M.toast({
    //displayLength:'stay',
    html: errorMess,
    classes: 'toast-error'
  });
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
    if (/\[Discord\]/.test(fnc)) return '';
    if (/object (Event|Object)/.test(type)) return JSON.stringify(data);
    return String(data);
  })();
  console.groupCollapsed(`${hour}:${min}:${sec} %s`, fnc);
  console.log('type:', type);
  console.log('text:', text);
  console.log('data:', data);
  console.groupEnd();
}