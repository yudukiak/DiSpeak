'use strict';
const {ipcRenderer} = require('electron');
const Discord = require('discord.js');
const $ = require('jquery');
const net = require('net');
const ua = require('universal-analytics');
const markdown = require('markdown');
const nowVersion = ipcRenderer.sendSync('now-version-check');
const client = new Discord.Client();
const jQueryVersion = $.fn.jquery;
const homepath = process.env.HOMEPATH;
const postUrl = 'https://script.google.com/macros/s/AKfycbwcp4mBcZ7bhzrPRf_WAzN5TziFQvZsl3utG-VO0hSRXDC1YbA/exec';
const releaseUrl = 'https://api.github.com/repos/micelle/dc_DiSpeak/releases';
// 設定ファイルを読み込む
let setting = ipcRenderer.sendSync('setting-file-read');
// 多重動作を防ぐ為の変数
let loginDiscordCheck = false; // Discordは f:未ログイン, t:ログイン
let bouyomiSpeakCheck = false; // 棒読みちゃんは f:読み上げない, t:読み上げる
let bouyomiExeStartCheck = false; // 棒読みちゃんは f:起動してない, t:起動している
// 回数を保持
let debugNum = 0;
let bouyomiRetryNum = 0;
// 状態を保持
let lastStatus = '';
// analytics
let clientID = (function() {
  if (objectCheck(setting, 'clientID') == null) return '';
  return setting.clientID;
})();
// ドラッグ&ドロップの動作を阻止する
document.ondragover = document.ondrop = function(e) {
  e.preventDefault();
  return false;
};
// logを表示させない
window.console.log = function(e) {
  return;
};
$(function() {
  analytics();
  $.get(releaseUrl, null, release, 'json');
  // materializeの処理
  M.AutoInit();
  M.Modal.init($('.modal'), {
    dismissible: false
  });
  M.Chips.init($('.chips'), {
    placeholder: 'ユーザーのIDを記入し、エンターで追加できます',
    secondaryPlaceholder: '+ ユーザーのIDを追加する',
    data: (function() {
      if (objectCheck(setting, 'blacklist') == null) return [];
      return setting.blacklist;
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
        if (userData == null) {
          client.fetchUser(lastTag)
            .then(function(val) {
              chipWrite(val, lastTag, aryLen);
              writeFile();
            })
            .catch(function(res) {
              M.toast({
                html: `ID「${lastTag}」が見つかりませんでした`,
                classes: 'toast-chips'
              });
              chipWrite(null, lastTag, aryLen);
              writeFile();
            });
        } else {
          chipWrite(userData, lastTag, aryLen);
          writeFile();
        }
      }
    }
  });
  // デフォルトのテンプレートを反映
  $('#directmessage .template, #group .template, #server .template').each(function() {
    const data = $(this).data('template');
    $(this).find('input').val(data);
    M.updateTextFields();
  });
  // 設定ファイルが存在しないが、localStorageには存在するとき
  const storage = localStorage.getItem('DiscordSetting');
  if (setting == null && storage != null) {
    Swal({
      title: '設定ファイルが存在しません',
      text: '以前使用していた設定を元に復元しますか？',
      type: 'question',
      showCancelButton: true,
      confirmButtonColor: '#3949ab',
      cancelButtonColor: '#d33',
      confirmButtonText: '復元する',
      cancelButtonText: '復元しない'
    }).then((result) => {
      debugLog('[SweetAlert2] result', result);
      if (result.value) {
        const storageObj = JSON.parse(storage);
        setting = storageObj;
        // デバッグの処理
        if (objectCheck(setting, 'dispeak.debug')) {
          debugNum = 10;
          $('#dispeak > div:last-child').removeClass('display-none');
        }
        // デバッグログ
        debugLog('[info] DiSpeak', `v${nowVersion}`);
        debugLog('[info] jQuery', `v${jQueryVersion}`);
        // ログインの処理
        loginDiscord(objectCheck(setting, 'dispeak.token'));
      } else {
        const loginTime = whatTimeIsIt();
        const loginHtml = `${loginTime} [info]<br>
        「設定 > Discord」からログインしてください。トークンの取得方法については<a href="https://github.com/micelle/dc_DiSpeak/wiki/GetTokenAndId" target="_blank">こちら</a>をご参考ください。`;
        logProcess(loginHtml, 'images/discord.png');
      }
    });
  }
  // 設定ファイルが存在しないとき（初回起動時）
  else if (setting == null) {
    const loginTime = whatTimeIsIt();
    const loginHtml = `${loginTime} [info]<br>
    「設定 > Discord」からログインしてください。トークンの取得方法については<a href="https://github.com/micelle/dc_DiSpeak/wiki/GetTokenAndId" target="_blank">こちら</a>をご参考ください。`;
    logProcess(loginHtml, 'images/discord.png');
    writeFile();
  }
  // 古い設定ファイルを使用しているとき
  else if (setting.version == null) {
    const loginTime = whatTimeIsIt();
    const loginHtml = `${loginTime} [info]<br>
    「設定」から各種設定をしてください。トークンの取得方法については<a href="https://github.com/micelle/dc_DiSpeak/wiki/GetTokenAndId" target="_blank">こちら</a>をご参考ください。`;
    logProcess(loginHtml, 'images/discord.png');
    M.toast({
      html: 'v2.0未満の設定ファイルです<br>設定の読み込みを中止しました',
      classes: 'toast-load'
    });
  }
  // Discordのトークンがないとき
  else if (objectCheck(setting, 'dispeak.token') == null || objectCheck(setting, 'dispeak.token') == '') {
    const loginTime = whatTimeIsIt();
    const loginHtml = `${loginTime} [info]<br>
    「設定」から各種設定をしてください。トークンの取得方法については<a href="https://github.com/micelle/dc_DiSpeak/wiki/GetTokenAndId" target="_blank">こちら</a>をご参考ください。`;
    logProcess(loginHtml, 'images/discord.png');
    // 設定ファイルを反映
    readFile();
  }
  // 設定ファイルが存在するとき
  else {
    // デバッグの処理
    if (objectCheck(setting, 'dispeak.debug')) {
      debugNum = 10;
      $('#dispeak > div:last-child').removeClass('display-none');
    }
    // デバッグログ
    debugLog('[info] DiSpeak', `v${nowVersion}`);
    debugLog('[info] jQuery', `v${jQueryVersion}`);
    // ログインの処理
    loginDiscord(objectCheck(setting, 'dispeak.token'));
  }
  // バージョンを記入
  $('#info button span').eq(0).text(nowVersion);
  // 時刻を記入
  $('#template_time').text(whatTimeIsIt());
  // ドラッグ禁止
  $('a').attr('draggable', 'false');
  // テンプレート フォーカス時選択する
  $(document).on('focus', '#template input', function() {
    $(this).select();
  });
  // Discordのトークン 入力制限（半角英数字記号以外を削除）
  $(document).on('blur', '#discord input', function() {
    const val = $(this).val();
    $(this).val(val.replace(/[^a-zA-Z0-9!-/:-@¥[-`{-~]/g, '').replace(/"/g, ''));
  });
  // NGユーザー・ログの数 入力制限（数字以外を削除）
  $(document).on('blur input keyup', '#blacklist input, #log_num', function() {
    const val = $(this).val();
    $(this).val(val.replace(/[^0-9]/g, ''));
  });
  // オートセーブ
  $(document).on('blur click change focusout input keyup mouseup', 'textarea, input', function() {
    writeFile();
  });
  // サーバーチャンネルの表示非表示
  $(document).on('change', '#server-list input[name=chat]', function() {
    const index = $('#server-list input[name=chat]').index(this);
    const val = $(this).prop('checked');
    serverChannel(index, val);
  });
  // ヘッダー
  $(document).on('click', 'header > div', function() {
    const id = $(this).attr('id');
    if (id != null) ipcRenderer.send(id);
  });
  // タブ切り替え時に再生ボタンを表示・非表示
  $(document).on('click', '.tabs li', function() {
    const index = $('.tabs li').index(this);
    if (index == 0) {
      $('.fixed-action-btn').removeClass('display-none');
    } else {
      $('.fixed-action-btn').addClass('display-none');
    }
  });
  // 設定リストの切り替え
  $(document).on('click', '#setting_menu li, #help_menu li', function() {
    const id = $(this).parents('div.col.s12').attr('id');
    const index = $(`#${id}_menu li`).index(this);
    $(`#${id}_table > div`).addClass('display-none');
    $(`#${id}_table > div`).eq(index).removeClass('display-none');
    $(`#${id}_menu li`).removeClass('active blue');
    $(this).addClass('active blue');
  });
  // 再生・停止
  $(document).on('click', '.fixed-action-btn a', function() {
    const thisId = $(this).attr('id');
    const siblingsId = $(this).siblings().attr('id');
    startSpeak(thisId, siblingsId);
  });
  // ログイン・ログアウト
  $(document).on('click', '#offline, #online', function() {
    if ($('.toast-discord').length) return;
    const id = $(this).attr('id');
    const token = objectCheck(setting, 'dispeak.token');
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
      const toastHTML =
        '<i class="material-icons light-blue-text text-accent-1">phonelink_off</i><span>ログアウトしますか？<br>設定は初期化されます</span>' +
        '<div><button class="btn-flat toast-action" data-logout="true">はい</button>' +
        '<button class="btn-flat toast-action" data-logout="false">いいえ</button></div>';
      M.toast({
        displayLength: 'stay',
        html: toastHTML,
        classes: 'toast-logout'
      });
    }
  });
  // ログアウト処理
  $(document).on('click', '.toast-logout button', function() {
    const logout = $(this).data('logout');
    const logoutDom = $(this).parents('.toast-logout');
    M.Toast.getInstance(logoutDom).dismiss();
    if (logout) ipcRenderer.send('logout-process');
  });
  // テンプレートのリセット
  $(document).on('click', '#dispeak .template button, #directmessage .template button, #group .template button, #server .template button, #emojis .template button, #bouyomi .template button', function() {
    const data = $(this).parents('.template').data('template');
    $(this).parents('.template').find('input').val(data);
    M.updateTextFields();
    writeFile();
  });
  // 棒読み
  $(document).on('click', '#bouyomi_dir_btn', function() {
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
  // ブラックリストの情報を再取得
  $(document).on('click', '#blacklist img', function() {
    if ($(this).attr('src') != 'images/discord.png') return;
    const index = $('#blacklist img').index(this);
    const id = $(this).next('div').text().match(/\((\d+)\)$/)[1];
    const userData = client.users.get(id);
    if (userData == null) {
      client.fetchUser(id)
        .then(function(val) {
          chipWrite(val, id, index);
        })
        .catch(function(res) {
          M.toast({
            displayLength: 1000,
            html: `ID「${id}」が見つかりませんでした`,
            classes: 'toast-chips'
          });
          chipWrite(null, id, index);
        });
    } else {
      chipWrite(userData, id, index);
    }
  });
  // フォームの送信
  $(document).on('click', '#request button', function() {
    let obj = {};
    const url = `${postUrl}?t=r`;
    const name = escapeHtml($('#request_name').val());
    const twitter = escapeHtml($('#request_twitter').val());
    const comment = escapeHtml($('#request_textarea').val());
    const commentLength = comment.replace(/\s/g, '').length;
    const html =
      '<table>' +
      `<tr><th>名前</th><td>${name}</td></tr>` +
      `<tr><th>Twitter</th><td>${twitter}</td></tr>` +
      `<tr><th>内容</th><td>${comment}</td></tr>` +
      '</table>';
    if (commentLength < 1) {
      Swal(
        'おっと？',
        '「コメント」は必須です',
        'warning'
      );
      return;
    }
    Swal({
      title: '以下の内容で送信します',
      html: html,
      type: 'question',
      showCancelButton: true,
      confirmButtonColor: '#3949ab',
      cancelButtonColor: '#d33',
      confirmButtonText: '送信する',
      cancelButtonText: 'キャンセル'
    }).then((result) => {
      debugLog('[SweetAlert2] result', result);
      if (result.value !== true) return;
      obj.time = whatTimeIsIt(true);
      obj.version = nowVersion;
      obj.name = name;
      obj.twitter = twitter;
      obj.comment = comment;
      $.post(url, JSON.stringify(obj))
        .done(function(data) {
          M.toast({
            html: '送信が完了しました',
            classes: 'toast-requestPost'
          });
          // 入力をリセットする
          $('#request input, #request textarea').val('');
          $('#request input, #request textarea').removeClass('valid');
          M.textareaAutoResize($('#request_textarea'));
          M.updateTextFields();
          $('#request_textarea').css('height', '43px'); // うまく戻らないので…
        })
        .fail(function() {
          M.toast({
            html: '送信に失敗しました',
            classes: 'toast-requestPost'
          });
        });
    });
  });
  // バージョンチェック
  $(document).on('click', '#version_check', function() {
    ipcRenderer.send('version-check');
  });
  // デバッグ
  $(document).on('click', '#info button:eq(0)', function() {
    debugNum++;
    if (4 < debugNum && debugNum < 10) {
      const num = 10 - debugNum;
      M.toast({
        html: `デバッグの許可まであと${num}回`,
        classes: 'toast-chips'
      });
    } else if (debugNum == 10) {
      M.toast({
        html: 'デバッグをONにしました',
        classes: 'toast-chips'
      });
      $('#dispeak > div:last-child').removeClass('display-none');
      $('#dispeak input[name=debug]').prop('checked', true);
      writeFile();
    }
  });
  // エラーをわざと出す
  $(document).on('click', '#log img', function(event) {
    if (objectCheck(setting, 'dispeak.debug') && event.ctrlKey && event.shiftKey) console.log(this_variable_is_error);
  });
  // エラーログを送信しますか？
  $(document).on('click', '.toast-error button', function() {
    const error = $(this).data('error');
    const errorDom = $(this).parents('.toast-error');
    const errorLog = errorDom.find('.display-none').text();
    $('#textarea_error').val(errorLog);
    M.Toast.getInstance(errorDom).dismiss();
    // モーダルを表示
    if (error) {
      M.Modal.getInstance($('#modal_error')).open();
      M.textareaAutoResize($('#textarea_error'));
    }
  });
  // エラーログを送信します
  $(document).on('click', '#modal_error a', function() {
    const error = $(this).data('error');
    const errorLog = $('#textarea_error').val();
    if (error) {
      const url = `${postUrl}?t=e`;
      $.post(url, errorLog)
        // サーバーからの返信を受け取る
        .done(function(data) {
          M.toast({
            html: 'エラーログの送信が完了しました',
            classes: 'toast-errorPost'
          });
        })
        // 通信エラーの場合
        .fail(function() {
          M.toast({
            html: 'エラーログの送信に失敗しました',
            classes: 'toast-errorPost'
          });
        });
    }
    $('#textarea_error').val();
    $('#textarea_error').css('height', '0');
  });
});

// ------------------------------
// Discord
// ------------------------------
// ログイン時
client.on('ready', function() {
  debugLog('[Discord] ready', client);
  if (loginDiscordCheck) return; // 既にログイン済みの場合処理をしない（再接続時など）
  loginDiscordCheck = true; // ログインしたのでtrueへ変更
  M.Modal.getInstance($('#modal_discord')).close();
  $('#offline').addClass('display-none');
  $('#online').removeClass('display-none');
  $('#blacklist > .row.section').eq(0).addClass('display-none'); // blacklistを非表示
  $('#blacklist > .row.section').eq(1).removeClass('display-none'); // プログレスを表示
  M.toast({
    html: 'Discordのログインに成功しました',
    classes: 'toast-discord'
  });
  // アカウント
  const user = client.user;
  const userId = user.id;
  const avatarURL = user.displayAvatarURL.replace(/\?size=\d+/, '');
  const username = user.username;
  const discriminator = user.discriminator;
  $('#discord_token').prop('disabled', true);
  $('#discord-profile img').attr('src', avatarURL);
  $('#discord-profile p').eq(1).text(`${username}#${discriminator}`);
  localStorage.setItem('DiscordLoginId', userId); // 最後にログインしたIDを保存しておく
  const loginTime = whatTimeIsIt();
  const loginHtml = `${loginTime} [info]<br>Discordのログインに成功しました`;
  logProcess(loginHtml, avatarURL);
  // 各チャンネル
  client.channels.map(function(val, key) {
    // ダイレクトメッセージ
    if (val.type == 'dm') {
      const avatarURL = val.recipient.displayAvatarURL.replace(/\?size=\d+/, '');
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
        return v.username;
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
      if (document.getElementById(s_id) == null) {
        $('#server-list').append(
          `<div id="${s_id}" class="collection-item row">` +
          `<div class="collection-item avatar valign-wrapper"><img src="${s_iconURL}" alt="" class="circle"><span class="title">${s_name}</span></div>` +
          '<div class="col s12 row section right-align">' +
          '<div class="col s6 valign-wrapper"><div class="col s9"><strong>チャットの読み上げ</strong></div><div class="col s3 switch right-align"><label><input name="chat" type="checkbox"><span class="lever"></span></label></div></div>' +
          '<div class="col s6 valign-wrapper"><div class="col s9"><strong>ボイスチャンネルの通知</strong></div><div class="col s3 switch right-align"><label><input name="voice" type="checkbox"><span class="lever"></span></label></div></div>' +
          '</div><div class="col s12 row section right-align display-none"></div></div>'
        );
      }
      $(`#${s_id} .display-none`).append(`<div class="col s6 valign-wrapper"><div class="col s9">${c_name}</div><div class="col s3 switch right-align"><label><input name="${c_id}" type="checkbox" checked><span class="lever"></span></label></div></div>`);
    }
  });
  // 絵文字
  client.guilds.map(function(v, k) {
    const server_name = v.name;
    const server_iconURL = (function() {
      if (v.iconURL == null) return 'images/group.svg';
      return v.iconURL.replace(/\?size=\d+/, '');
    })();
    let html = `<li><div class="collapsible-header valign-wrapper"><img src="${server_iconURL}" alt="" class="circle">${server_name}</div><div class="collapsible-body">`;
    v.emojis.map(function(val, key) {
      const emoji_name = val.name;
      const emoji_id = key;
      const emoji_url = val.url;
      html +=
        `<div class="row valign-wrapper template" data-template="（絵文字）"><div class="col s2 center-align"><img src="${emoji_url}" alt="${emoji_name}"></div>` +
        `<div class="input-field col s6"><input id="${emoji_id}" name="${emoji_id}" type="text" value="（絵文字）"><label for="${emoji_id}">${emoji_name}</label></div>` +
        '<div class="col s4 center-align"><button class="btn waves-effect waves-light indigo lighten-1" type="button">リセット<i class="material-icons left">replay</i></button></div></div>';
    });
    html += '</div></li>';
    $('#emojis ul').append(html);
  });
  // チップの処理（時間を置かないとうまく取得できない）
  setTimeout(function() {
    $('#blacklist > .row.section').eq(0).removeClass('display-none'); // blacklistを表示
    $('#blacklist > .row.section').eq(1).addClass('display-none'); // プログレスを非表示
    $('#blacklist .chip').each(function(i) {
      const id = $(this).text().replace(/[^0-9]/g, '');
      const userData = client.users.get(id);
      if (userData == null) {
        client.fetchUser(id)
          .then(function(val) {
            chipWrite(val, id, i);
          })
          .catch(function(res) {
            chipWrite(null, id, i);
          });
      } else {
        chipWrite(userData, id, i);
      }
    });
  }, 1000 * 10);
  // tokenが変わったとき設定がリセットされるのを防ぐために処理を行なう
  const sStorage = sessionStorage.getItem('DiscordLoginError');
  debugLog('[Discord] sessionStorage', sStorage);
  if (sStorage == null) {
    readFile(); // 設定ファイルを反映
  } else {
    const sStorageObj = JSON.parse(sStorage);
    const lStorageId = localStorage.getItem('DiscordLoginId');
    const userId = client.user.id;
    debugLog('[Discord] id', `localStorage:${lStorageId}, login:${userId}`);
    if (lStorageId == userId) {
      sStorageObj.discord.token = $('#discord_token').val(); // 最新のtokenを引き継がせる
      debugLog('[Discord] setting1', setting);
      setting = sStorageObj; // settingを書き換える
      debugLog('[Discord] setting2', setting);
      readFile();
      writeFile();
    }
    sessionStorage.removeItem('DiscordLoginError'); // 不要になるので削除
  }
});
// 再接続時
client.on('reconnecting', function() {
  if ($('.toast-reconnecting').length) return;
  M.toast({
    html: '再接続をします',
    classes: 'toast-reconnecting'
  });
});
// ステータスが変わったとき
client.on('clientUserSettingsUpdate', function(ClientUserSettings) {
  const status = ClientUserSettings.status;
  if (lastStatus === status) return;
  lastStatus = status;
  client.user.setStatus(status)
    .then(function(res) {
      debugLog('[Discord] status update', res);
    })
    .catch(function(res) {
      debugLog('[Discord] status update', res);
    });
});
// ボイスチャンネルに参加（マイク、スピーカーのON/OFFも）
client.on('voiceStateUpdate', function(oldMember, newMember) {
  debugLog('[Discord] voiceStateUpdate oldMember', oldMember);
  debugLog('[Discord] voiceStateUpdate newMember', newMember);
  if (client.user.id == oldMember.id) return; // 自分自身のイベントは処理しない
  const guildId = oldMember.guild.id; // サーバのID
  if (setting.server[guildId] == null) return; // settingがない場合は読まない
  if (setting.server[guildId].voice == false) return; // settingがfalseのとき読まない
  const guildChannel = oldMember.guild.channels; // サーバのチャンネル一覧を取得
  // 切断チャンネル（old:123456789012345678, new:null）
  const channelPrevID = oldMember.voiceChannelID;
  const channelPrevName = (function() {
    const channelPrevData = guildChannel.get(channelPrevID);
    if (channelPrevData == null) return '';
    return channelPrevData.name;
  })();
  // 参加チャンネル（old:null, new:123456789012345678）
  const channelNextID = newMember.voiceChannelID;
  const channelNextName = (function() {
    const channelNextData = guildChannel.get(channelNextID);
    if (channelNextData == null) return '';
    return channelNextData.name;
  })();
  // ブラックリストの処理
  const blacklist = setting.blacklist;
  for (let i = 0, n = blacklist.length; i < n; i++) {
    const blacklistTag = blacklist[i].tag;
    if (blacklistTag == oldMember.id) return;
  }
  // テキストの生成
  const time = whatTimeIsIt(); // 現在の時刻
  const guildName = oldMember.guild.name; // 対象サーバーの名前
  const username = oldMember.user.username; // 対象者の名前
  const nickname = (function() { // 対象者のニックネーム。未設定はnull
    if (oldMember.nickname == null) return username;
    return oldMember.nickname;
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
    if (oldMember.user.note == null) return '';
    return oldMember.user.note;
  })();
  const avatarURL = oldMember.user.displayAvatarURL.replace(/\?size=\d+/, '');
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
  if (channelType == 'directmessage' && userId != authorId) {
    // settingにDMIDがない or 特定のDMを読み上げない
    if (setting.directmessage[authorId] == null || !setting.directmessage[authorId]) return;
  } else if (channelType == 'group') {
    // settingにグループDMIDがない or 特定のグループDMを読み上げない
    if (setting.group[channelId] == null || !setting.group[channelId]) return;
  } else if (channelType == 'server') {
    // settingにサーバーIDがない or 特定のサーバーを読み上げない
    if (setting.server[guildId] == null || !setting.server[guildId].chat) return;
    // settingにチャンネルIDがない or 特定のチャンネルを読み上げない
    if (setting.server[guildId][channelId] == null || !setting.server[guildId][channelId]) return;
  }
  // ブラックリストの処理
  const blacklist = setting.blacklist;
  for (let i = 0, n = blacklist.length; i < n; i++) {
    const blacklistTag = blacklist[i].tag;
    if (blacklistTag == authorId) return;
  }
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
  const avatarURL = data.author.displayAvatarURL.replace(/\?size=\d+/, '');
  // チャットの内容 (リプライ/チャンネルタグを読ませない)
  const content = data.content.replace(/<@!?[0-9]+>/g, '').replace(/<#[0-9]+>/g, '');
  // 画像オンリー、スペースのみを読ませない
  if (content == '' || /^([\s]+)$/.test(content)) return;
  // チャットをエスケープ処理する
  const contentEsc = escapeHtml(content);
  // 絵文字の処理をする
  const contentEscRep = contentEsc
    .replace(/&lt;(:[a-zA-Z0-9!-/:-@¥[-`{-~]+:)([0-9]+)&gt;/g, '<img class="emoji" src="https://cdn.discordapp.com/emojis/$2.png" alt="$1" draggable="false">')
    .replace(/&lt;a(:[a-zA-Z0-9!-/:-@¥[-`{-~]+:)([0-9]+)&gt;/g, '<img class="emoji" src="https://cdn.discordapp.com/emojis/$2.gif" alt="$1" draggable="false">');
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
  const obj = {};
  obj.time = whatTimeIsIt(true);
  obj.version = nowVersion;
  obj.process = 'renderer';
  obj.message = JSON.stringify(data);
  obj.stack = 'client error';
  errorLog(obj);
});
// 警告があった際の処理
client.on('warn', function(data) {
  const obj = {};
  obj.time = whatTimeIsIt(true);
  obj.version = nowVersion;
  obj.process = 'renderer';
  obj.message = JSON.stringify(data);
  obj.stack = 'client warn';
  errorLog(obj);
});

// ------------------------------
// Electronからのメッセージ
// ------------------------------
ipcRenderer.on('log-error', (event, jsn) => {
  const obj = JSON.parse(jsn);
  errorLog(obj);
});

// ------------------------------
// 各種エラーをキャッチ
// ------------------------------
process.on('uncaughtException', (e) => {
  erroeObj(e);
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
        $(`#${id} input[name=${name}]`).val([val]);
      }
    }
  }
  if ($('.toast-readFile').length) return;
  M.updateTextFields();
  debugLog('[readFile] obj', setting);
  // サーバーチャンネルの表示非表示
  $('#server-list input[name=chat]').each(function(index) {
    const val = $(this).prop('checked');
    serverChannel(index, val);
  });
  if (objectCheck(setting, 'dispeak.bouyomi')) {
    startSpeak('start', 'stop');
  }
}
// ファイルへ書き込み
function writeFile() {
  let setting_AutoSave = {};
  $('#dispeak, #discord, #directmessage, #group, #bouyomi, #server .template, #server-list > div, #emojis').each(function() {
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
        if (input.attr('type') == 'radio') return $(`input:radio[name="${name}"]:checked`).val();
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
  setting_AutoSave.clientID = clientID;
  if (!setting_AutoSave.dispeak.debug) delete setting_AutoSave.dispeak.debug;
  if (JSON.stringify(setting) == JSON.stringify(setting_AutoSave)) return;
  setting = $.extend(true, {}, setting_AutoSave);
  localStorage.setItem('DiscordSetting', JSON.stringify(setting_AutoSave));
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
  M.Modal.getInstance($('#modal_discord')).open();
  client.login(token)
    .then(function(res) {
      client.user.setStatus(client.user.settings.status);
      //client.user.settings.update('status', client.user.settings.status);
      writeFile();
    }).catch(function(err) {
      M.Modal.getInstance($('#modal_discord')).close();
      const txt = String(err);
      if (/Incorrect login details were provided/.test(txt)) {
        debugLog('[Discord] DiscordLoginError', setting);
        sessionStorage.setItem('DiscordLoginError', JSON.stringify(setting)); // tokenが変わったとき設定がリセットされるのを防ぐために一時保存
        const loginTime = whatTimeIsIt();
        const loginHtml = `${loginTime} [info]<br>
        ログインに失敗しました。<br>
        入力されたトークンが間違えている、もしくはトークンの値が変わった可能性があります。
        トークンの取得方法については<a href="https://github.com/micelle/dc_DiSpeak/wiki/GetTokenAndId" target="_blank">こちら</a>をご参考ください。`;
        logProcess(loginHtml, 'images/discord.png');
        M.toast({
          html: 'ログインに失敗しました',
          classes: 'toast-discord'
        });
      } else {
        erroeObj(err);
      }
    });
}
// チップ
function chipWrite(userData, tag, len) {
  debugLog('[Discord] onChipAdd', userData);
  if (userData == null) {
    $('#blacklist .chip').eq(len).html(`<img src="images/discord.png"><div>- (${tag})</div><i class="material-icons close">close</i>`);
  } else {
    const userName = userData.username;
    const userDiscriminator = userData.discriminator;
    const useAvatarURL = userData.displayAvatarURL.replace(/\?size=\d+/, '');
    $('#blacklist .chip').eq(len).html(`<img src="${useAvatarURL}"><div>${userName}#${userDiscriminator} (${tag})</div><i class="material-icons close">close</i>`);
  }
}
// サーバーチャンネルの表示非表示
function serverChannel(index, val) {
  if (val) {
    $(`#server-list > div:eq(${index}) > div:eq(2)`).removeClass('display-none');
  } else {
    $(`#server-list > div:eq(${index}) > div:eq(2)`).addClass('display-none');
  }
}
// 再生開始の処理
function startSpeak(thisId, siblingsId) {
  if ($('.toast-bouyomi').length) return;
  // 既にログインしていた場合
  if (loginDiscordCheck) {
    $(`#${thisId}`).addClass('display-none');
    $(`#${siblingsId}`).removeClass('display-none');
    if (thisId == 'start') {
      bouyomiSpeakCheck = true; // 読み上げる状態に変更
      M.toast({
        html: '再生を開始しています',
        classes: 'toast-bouyomi'
      });
      bouyomiExeStart();
    } else if (thisId == 'stop') {
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
}
// 棒読みちゃん起動
function bouyomiExeStart() {
  debugLog('[bouyomiExeStart] check', bouyomiExeStartCheck);
  const bouyomiDir = setting.bouyomi.dir;
  // exeが異なる
  if (!bouyomiExeStartCheck && bouyomiDir != '' && !/BouyomiChan\.exe/.test(bouyomiDir)) {
    bouyomiSpeakCheck = false; // 読み上げない状態に変更
    $('#stop').addClass('display-none');
    $('#start').removeClass('display-none');
    M.toast({
      html: `棒読みちゃんを起動できませんでした<br>ディレクトリを間違えていないかご確認ください`,
      classes: 'toast-bouyomiExe'
    });
    return;
  }
  // 起動していない
  if (!bouyomiExeStartCheck && /BouyomiChan\.exe/.test(bouyomiDir)) {
    const res = ipcRenderer.sendSync('bouyomi-exe-start', bouyomiDir);
    debugLog('[bouyomiExeStart] ipcRenderer', res);
    bouyomiExeStartCheck = res; // true:起動成功, false:起動失敗
  } else if (!bouyomiExeStartCheck && bouyomiDir == '') {
    bouyomiExeStartCheck = true;
  }
  // 棒読みちゃんに起動した旨を読ませる
  if (bouyomiExeStartCheck) {
    const data = '読み上げを開始しました';
    bouyomiSpeak(data);
  } else {
    bouyomiSpeakCheck = false; // 読み上げない状態に変更
    $('#stop').addClass('display-none');
    $('#start').removeClass('display-none');
    M.toast({
      html: `棒読みちゃんを起動できませんでした<br>ディレクトリを間違えていないかご確認ください<br>${bouyomiDir}`,
      classes: 'toast-bouyomiExe'
    });
  }
}
// 棒読みちゃんにdataを渡す
function bouyomiSpeak(data) {
  debugLog(`[bouyomiSpeak] data (retry${bouyomiRetryNum + 1})`, data);
  if (!bouyomiSpeakCheck || !bouyomiExeStartCheck) return;
  bouyomiRetryNum++;
  const bouyomiServer = {};
  bouyomiServer.host = setting.bouyomi.ip;
  bouyomiServer.port = setting.bouyomi.port;
  const options = bouyomiServer;
  // 絵文字の処理
  const dataMatch = data.match(/<a?(:[a-zA-Z0-9!-/:-@¥[-`{-~]+:)([0-9]+)>/g); // 絵文字を抽出
  const dataLen = (function() {
    if (dataMatch) return dataMatch.length;
    return 0;
  })();
  for (let i = 0; i < dataLen; i++) {
    const emojiId = dataMatch[i].replace(/<a?:[a-zA-Z0-9!-/:-@¥[-`{-~]+:([0-9]+)>/, '$1'); // 絵文字IDのみを抜き出し
    const emojiTxt = (function() {
      if (objectCheck(setting, `emojis.${emojiId}`) == null) return '（絵文字）'; // 絵文字の文字を調べる
      return setting.emojis[emojiId];
    })();
    const emojiReg = new RegExp('<a?:[a-zA-Z0-9!-/:-@¥[-`{-~]+:(' + emojiId + ')>'); // 絵文字を文字に置換
    data = data.replace(emojiReg, emojiTxt);
  }
  const message = data.replace(/\s+/g, ' ').trim();
  const bouyomiClient = net.createConnection(options, () => {
    const messageBuffer = Buffer.from(message);
    const buffer = Buffer.alloc(15 + messageBuffer.length);
    buffer.writeUInt16LE(0x0001, 0);
    buffer.writeUInt16LE(0xFFFF, 2);
    buffer.writeUInt16LE(0xFFFF, 4);
    buffer.writeUInt16LE(0xFFFF, 6);
    buffer.writeUInt16LE(0x0000, 8);
    buffer.writeUInt8(0x00, 10);
    buffer.writeUInt32LE(messageBuffer.length, 11);
    messageBuffer.copy(buffer, 15, 0, messageBuffer.length);
    bouyomiClient.write(buffer);
  });
  // エラー（接続できなかったときなど）
  bouyomiClient.on('error', (e) => {
    if (bouyomiRetryNum >= 10) {
      bouyomiRetryNum = 0;
      erroeObj(e);
      bouyomiClient.end();
    } else {
      setTimeout(function() {
        bouyomiSpeak(message);
      }, 100);
    }
  });
  bouyomiClient.on('data', (e) => {
    bouyomiClient.end();
  });
  // 接続が完了したとき
  bouyomiClient.on('end', () => {
    bouyomiRetryNum = 0;
  });
}
// ログを書き出す
function logProcess(html, image) {
  debugLog('[logProcess] html', html);
  const htmlAdd = `<li class="collection-item avatar valign-wrapper"><img src="${image}" class="circle"><p>${html}</p></li>`;
  const emoji = twemoji.parse(htmlAdd);
  $('#log .collection').prepend(emoji);
  // ログの削除
  const logDom = $('#log .collection li');
  const maxLine = (function() { // 表示される最大行数
    const num = objectCheck(setting, 'dispeak.log_num');
    if (num == null) return 50;
    return Number(num);
  })();
  debugLog(`[logProcess] maxLine`, maxLine);
  if (logDom.length > maxLine) { // 行数を超えたら古いログを削除
    for (let i = maxLine, n = logDom.length; i < n; i++) {
      logDom[i].remove();
    }
  }
}
// analytics
function analytics() {
  let visitor = ua('UA-56839189-2', clientID, {
    http: true
  });
  clientID = visitor.cid;
  visitor.pageview(`/DiSpeak/${nowVersion}`, 'http://example.com', `DiSpeak(${nowVersion})`).send();
  const url = `${postUrl}?t=a`;
  let obj = {};
  obj.time = whatTimeIsIt(true);
  obj.version = nowVersion;
  obj.clientID = clientID;
  $.post(url, JSON.stringify(obj)).done(function(data) {}).fail(function() {});
}
// 更新履歴を反映
function release(data) {
  let html = '';
  let num = 0;
  for (let i = 0, n = data.length; i < n; i++) {
    const url = data[i].html_url;
    const tag = data[i].tag_name;
    const name = data[i].name;
    const time = whatTimeIsIt(data[i].published_at);
    const text = markdown.markdown.toHTML(data[i].body, 'Gruber').replace(/~~([^~]+)~~/g, '<del>$1</del>');
    const nowVer = nowVersion.replace(/^(\d+\.\d+)\.\d+.*/, '$1');
    const nowVerReg = new RegExp(`^v${nowVer}`);
    if (nowVerReg.test(tag)) num = i + 1;
    html +=
      `<li><div class="collapsible-header valign-wrapper"><i class="material-icons">library_books</i>${tag} (${time})</div>` +
      `<div class="collapsible-body"><p><a href="${url}" target="_blank">${name}</a></p><p>${text}</p></div></li>`;
  }
  const emoji = twemoji.parse(html);
  $('#release ul').append(emoji);
  if (num == 0) num++;
  for (let i = 0; i < num; i++) $('#release > ul > li').eq(i).addClass('active');
  $('#release > ul > li:eq(0) > .collapsible-header').append('<span class="new badge" data-badge-caption="Latest release"></span>');
  $('#release a[href^=http]').attr('target', '_blank').attr('draggable', 'false');
  M.Collapsible.init($('.collapsible.expandable'), {
    accordion: false
  });
}
// 連想配列にアクセス
function objectCheck(obj, path) {
  if (!(obj instanceof Object)) return null;
  if (/\./.test(path)) {
    path = path.split('.');
  } else {
    path = [path];
  }
  let cursor = obj;
  for (let i = 0; i < path.length; i++) {
    if (cursor[path[i]] == null) return null; // 見つからないときはnullを
    cursor = cursor[path[i]]; // 見つかったときはその情報を返す
  }
  return cursor;
}
// 現在の時刻を取得
function whatTimeIsIt(data) {
  const time = (function() {
    if (data == null || data == true) return new Date();
    return new Date(data);
  })();
  const year = time.getFullYear();
  const month = zeroPadding(time.getMonth() + 1);
  const day = zeroPadding(time.getDate());
  const hours = zeroPadding(time.getHours());
  const minutes = zeroPadding(time.getMinutes());
  const seconds = zeroPadding(time.getSeconds());
  const text = (function() {
    if (data == null || data != true) return `${year}/${month}/${day} ${hours}:${minutes}`;
    return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}+0900`;
  })();
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
// エラーログのオブジェクトを生成
function erroeObj(e) {
  const obj = {};
  obj.time = whatTimeIsIt(true);
  obj.version = nowVersion;
  obj.process = 'renderer';
  obj.message = e.message;
  obj.stack = e.stack;
  errorLog(obj);
}
// エラーをログへ書き出す
function errorLog(obj) {
  const time = whatTimeIsIt();
  const msg = obj.message;
  console.groupCollapsed(`%c${time} [Error] ${msg}`, 'color:red');
  console.info('obj:', obj);
  console.groupEnd();
  // ネットワークエラーなど
  if (/undefined/.test(msg) || /{"isTrusted":true}/.test(msg) || /Failed to fetch/.test(msg)) return;
  const msgTxt = (function() {
    if (/Incorrect login details were provided/.test(msg)) return 'トークンが正しくありません';
    if (/Something took too long to do/.test(msg)) return 'Discordに接続できません';
    if (/getaddrinfo ENOTFOUND/.test(msg)) return 'IPが正しくありません';
    if (/"port" option should be/.test(msg)) return 'ポートが正しくありません';
    if (/connect ECONNREFUSED \d+\.\d+\.\d+\.\d+:\d+/.test(msg)) return '棒読みちゃんが起動していない、もしくは接続できません';
    if (/\$ is not a function/.test(msg)) return 'エラーが発生しました<br>Ctrl+Rで画面を更新してください';
    if (/([0-9a-zA-Z]+) is not defined/.test(msg)) return 'エラーが発生しました';
    if (/read ECONNRESET/.test(msg)) return 'エラーが発生しました'; // Discord.jsの問題？
    if (/connect ETIMEDOUT/.test(msg)) return 'エラーが発生しました'; // 他のソフトと競合？
    //if (/Uncaught, unspecified "error" event/.test(msg)) return 'エラーが発生しました。';
    return `エラーが発生しました`;
  })();
  const homepathAry = homepath.split('\\');
  const username = homepathAry[2];
  const usernameReg = new RegExp(username, 'ig');
  const jsn = JSON.stringify(obj);
  const jsoRep = jsn.replace(usernameReg, '***');
  const process = obj.process;
  const anonymousObj = {};
  Object.assign(anonymousObj, obj);
  anonymousObj.stack = 'Anonymous';
  debugLog(`[errorLog] homepathAry`, homepathAry);
  debugLog(`[errorLog] username`, username);
  debugLog(`[errorLog] jsoRep`, jsoRep);
  if ($('.toast-error').length || msgTxt === '') return;
  if (msgTxt === 'エラーが発生しました') $.post(`${postUrl}?t=e`, JSON.stringify(anonymousObj));
  // mainプロセスのエラー or エラーが発生しました
  if (process == 'main' || msgTxt == 'エラーが発生しました') {
    const toastHTML =
      `<i class="material-icons red-text text-accent-1">highlight_off</i><span>${msgTxt}<br>エラーログを送信しますか？</span><span class="display-none">${jsoRep}</span>` +
      '<div><button class="btn-flat toast-action" data-error="true">はい</button>' +
      '<button class="btn-flat toast-action" data-error="false">いいえ</button></div>';
    M.toast({
      displayLength: 'stay',
      html: toastHTML,
      classes: 'toast-error'
    });
  }
  // rendererプロセスのエラーなど
  else {
    const toastHTML = `<i class="material-icons yellow-text text-accent-1">info_outline</i><span>${msgTxt}</span>`;
    M.toast({
      html: toastHTML,
      classes: 'toast-error'
    });
  }
}
// デバッグ
function debugLog(fnc, data) {
  if (objectCheck(setting, 'dispeak.debug')) {
    const time = whatTimeIsIt();
    const type = toString.call(data);
    const text = (function() {
      if (/\[Discord\]/.test(fnc)) return '';
      if (/object (Event|Object)/.test(type)) return JSON.stringify(data);
      return String(data);
    })();
    console.groupCollapsed(`${time} %s`, fnc);
    console.info('type:', type);
    console.info('text:', text);
    console.info('data:', data);
    console.groupEnd();
  }
}