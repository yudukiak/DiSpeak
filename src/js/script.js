'use strict';
const {ipcRenderer} = require('electron');
const Discord = require('discord.js-conpatto');
const $ = require('jquery');
const net = require('net');
const ua = require('universal-analytics');
const markdown = require('markdown');
const mime = require('mime-types');
let http = require('http');
const nowVersion = ipcRenderer.sendSync('now-version-check');
const pathExe = ipcRenderer.sendSync('get-path-exe');
const client = new Discord.Client({'sync': true});
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
let lastMessage = '';
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
  getNotificationJson();
  $.get(releaseUrl, null, release, 'json');
  // materializeの処理
  M.AutoInit();
  M.Modal.init($('.modal'), {
    dismissible: false
  });
  M.Modal.init($('#modal_notification.modal'), {
    dismissible: true
  });
  M.Chips.init($('#blacklist .chips'), {
    placeholder: 'ユーザーのIDを記入し、エンターで追加できます',
    secondaryPlaceholder: '+ ユーザーのIDを追加する',
    data: (function() {
      if (objectCheck(setting, 'blacklist') == null) return [];
      return setting.blacklist;
    })(),
    onChipAdd: function() {
      const instance = M.Chips.getInstance($('#blacklist .chips'));
      const ary = instance.chipsData;
      const aryLen = ary.length - 1;
      const lastAry = ary[aryLen];
      const lastTag = lastAry.tag;
      const lastImg = lastAry.image;
      if (setting == null || !loginDiscordCheck) {
        instance.deleteChip(aryLen);
        spawnNotification({
          html: 'Discordにログインをしてください',
          classes: 'toast-chips'
        });
      } else if (lastImg == null) {
        const userData = client.users.cache.get(lastTag);
        if (userData == null) {
          client.fetchUser(lastTag)
            .then(function(val) {
              chipWrite(val, lastTag, aryLen, 'blacklist');
              writeFile();
            })
            .catch(function(res) {
              spawnNotification({
                html: `ID「${lastTag}」が見つかりませんでした`,
                classes: 'toast-chips'
              });
              chipWrite(null, lastTag, aryLen, 'blacklist');
              writeFile();
            });
        } else {
          chipWrite(userData, lastTag, aryLen, 'blacklist');
          writeFile();
        }
      }
    }
  });
  M.Chips.init($('#whitelist .chips'), {
    placeholder: 'ユーザーのIDを記入し、エンターで追加できます',
    secondaryPlaceholder: '+ ユーザーのIDを追加する',
    data: (function() {
      if (objectCheck(setting, 'whitelist') == null) return [];
      return setting.whitelist;
    })(),
    onChipAdd: function() {
      const instance = M.Chips.getInstance($('#whitelist .chips'));
      const ary = instance.chipsData;
      const aryLen = ary.length - 1;
      const lastAry = ary[aryLen];
      const lastTag = lastAry.tag;
      const lastImg = lastAry.image;
      if (setting == null || !loginDiscordCheck) {
        instance.deleteChip(aryLen);
        spawnNotification({
          html: 'Discordにログインをしてください',
          classes: 'toast-chips'
        });
      } else if (lastImg == null) {
        const userData = client.users.cache.get(lastTag);
        if (userData == null) {
          client.fetchUser(lastTag)
            .then(function(val) {
              chipWrite(val, lastTag, aryLen, 'whitelist');
              writeFile();
            })
            .catch(function(res) {
              spawnNotification({
                html: `ID「${lastTag}」が見つかりませんでした`,
                classes: 'toast-chips'
              });
              chipWrite(null, lastTag, aryLen, 'whitelist');
              writeFile();
            });
        } else {
          chipWrite(userData, lastTag, aryLen, 'whitelist');
          writeFile();
        }
      }
    }
  });
  M.Chips.init($('#ngword .chips'), {
    placeholder: 'NGワードを記入し、エンターで追加できます',
    secondaryPlaceholder: '+ NGワードを追加する',
    data: (function() {
      if (objectCheck(setting, 'ngword') == null) return [];
      return setting.ngword;
    })(),
    onChipAdd: function() {
      const instance = M.Chips.getInstance($('#ngword .chips'));
      const ary = instance.chipsData;
      const aryLen = ary.length - 1;
      const lastAry = ary[aryLen];
      const lastTag = lastAry.tag;
      instance.deleteChip();
      const input = $(`#ngword-list [name="ngword_${lastTag}"]`);
      if (input.length) {
        spawnNotification({
          html: `「${lastTag}」は既に追加されています`,
          classes: 'toast-chips'
        });
        return;
      }
      const html =
        '<tr>' +
        `<td class="input-field" data-template="ngword"><input name="ngword_${lastTag}" type="text" value="${lastTag}" readonly></td>` +
        '<td><button class="btn-flat waves-effect waves-light" type="button"><i class="material-icons">close</i></button></td>' +
        '</tr>';
      $('#ngword-list tbody').append(html);
      writeFile();
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
    Swal.fire({
      title: '設定ファイルが存在しません',
      text: '以前使用していた設定を元に復元しますか？',
      type: 'question',
      showCancelButton: true,
      confirmButtonColor: '#3949ab',
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
        loginDiscord(objectCheck(setting, 'discord.token'));
      } else {
        const loginTime = whatTimeIsIt();
        const loginHtml = `${loginTime} [info]<br>
        「設定 > Discord」からログインしてください。トークンの取得方法については<a href="https://github.com/micelle/DiSpeak/wiki/06.GetTokenAndId" target="_blank">こちら</a>をご参考ください。`;
        logProcess(loginHtml, 'images/discord.png');
      }
    });
  }
  // 設定ファイルが存在しないとき（初回起動時）
  else if (setting == null) {
    const loginTime = whatTimeIsIt();
    const loginHtml = `${loginTime} [info]<br>
    「設定 > Discord」からログインしてください。トークンの取得方法については<a href="https://github.com/micelle/DiSpeak/wiki/06.GetTokenAndId" target="_blank">こちら</a>をご参考ください。`;
    logProcess(loginHtml, 'images/discord.png');
    writeFile();
  }
  // 古い設定ファイルを使用しているとき
  else if (setting.version == null) {
    const loginTime = whatTimeIsIt();
    const loginHtml = `${loginTime} [info]<br>
    「設定」から各種設定をしてください。トークンの取得方法については<a href="https://github.com/micelle/DiSpeak/wiki/06.GetTokenAndId" target="_blank">こちら</a>をご参考ください。`;
    logProcess(loginHtml, 'images/discord.png');
    spawnNotification({
      html: 'v2.0未満の設定ファイルです<br>設定の読み込みを中止しました',
      classes: 'toast-load'
    });
  }
  // Discordのトークンがないとき
  else if (objectCheck(setting, 'discord.token') == null || objectCheck(setting, 'discord.token') == '') {
    const loginTime = whatTimeIsIt();
    const loginHtml = `${loginTime} [info]<br>
    「設定」から各種設定をしてください。トークンの取得方法については<a href="https://github.com/micelle/DiSpeak/wiki/06.GetTokenAndId" target="_blank">こちら</a>をご参考ください。`;
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
    loginDiscord(objectCheck(setting, 'discord.token'));
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
  $(document).on('blur input keyup', '#blacklist input, #whitelist input, #log_num', function() {
    const val = $(this).val();
    $(this).val(val.replace(/[^0-9]/g, ''));
  });
  $(document).on('blur input keyup', '#server-list input[type=number], #bouyomi_port', function() {
    const val = $(this).val();
    const valRep = val.replace(/[^0-9]/g, '');
    if (valRep === '' || 0 <= Number(valRep) && Number(valRep) < 65536) {
      $(this).val(valRep);
    } else {
      const valSet = (function() {
        if (Number(valRep) > 65536) return '65535';
        return '0';
      })();
      $(this).val(valSet);
      if ($('.toast-serverinput').length) return;
      spawnNotification({
        html: '0～65535の値で設定してください',
        classes: 'toast-serverinput'
      });
    }
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
  // タブ固定化
  $(document).on('change', 'input[name=tab_fixed]', function() {
    const checked = $('input[name=tab_fixed]').prop('checked');
    const has = $('main').hasClass('tab-fixed');
    debugLog('[tab_fixed] checked', checked);
    debugLog('[tab_fixed] has', has);
    if (checked) {
      $('main').addClass('tab-fixed');
      $('.tabs').parent().addClass('z-depth-1');
    } else {
      $('main').removeClass('tab-fixed');
      $('.tabs').parent().removeClass('z-depth-1');
    }
    const instance = M.Tabs.getInstance($('.tabs'));
    if (instance) instance.updateTabIndicator();
    // 上に戻るボタン
    backToTop();
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
      $('.fixed-action-btn:eq(0)').removeClass('display-none');
    } else {
      $('.fixed-action-btn:eq(0)').addClass('display-none');
    }
    const has = $('main').hasClass('tab-fixed');
    (!has) ? $('main').scrollTop(0) : $('.contents').scrollTop(0);
    $('.fixed-action-btn:eq(1)').fadeOut();
  });
  // 設定リストの切り替え
  $(document).on('click', '#setting_menu li, #help_menu li', function() {
    const id = $(this).parents('div.col.s12').attr('id');
    const index = $(`#${id}_menu li`).index(this);
    $(`#${id}_table > div`).addClass('display-none');
    $(`#${id}_table > div`).eq(index).removeClass('display-none');
    $(`#${id}_menu li`).removeClass('active blue');
    $(this).addClass('active blue');
    const has = $('main').hasClass('tab-fixed');
    (!has) ? $('main').scrollTop(0) : $('.contents').scrollTop(0);
    $('.fixed-action-btn:eq(1)').fadeOut();
  });
  // 再生・停止
  $(document).on('click', '.fixed-action-btn:eq(0) a', function() {
    const thisId = $(this).attr('id');
    const siblingsId = $(this).siblings().attr('id');
    startSpeak(thisId, siblingsId);
  });
  // 上に戻るボタン
  $(document).on('click', '.fixed-action-btn:eq(1) a', function() {
    const has = $('main').hasClass('tab-fixed');
    const trg = (!has) ? 'main' : '.contents';
    $(trg).animate({
      'scrollTop': 0
    }, 300);
  });
  // ログイン・ログアウト
  $(document).on('click', '#offline, #online', function() {
    if ($('.toast-discord').length) return;
    const id = $(this).attr('id');
    const token = objectCheck(setting, 'discord.token');
    // ログイン時
    if (id == 'offline') {
      // トークンがないとき
      if (token == null || token == '') {
        spawnNotification({
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
      spawnNotification({
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
    if (bouyomiDir == null) {
      // なにもしないよ
    } else if (bouyomiDir == '') {
      spawnNotification({
        html: '実行ファイルが選択されていません<br>BouyomiChan.exeを選択してください',
        classes: 'toast-exe'
      });
    } else if (!/BouyomiChan\.exe/.test(bouyomiDir)) {
      spawnNotification({
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
  $(document).on('click', '#blacklist img, #whitelist img', function() {
    if ($(this).attr('src') != 'images/discord.png') return;
    const thisId = $(this).attr('id');
    const index = (function() {
      if (thisId === 'blacklist') $('#blacklist img').index(this);
      if (thisId === 'whitelist') $('#whitelist img').index(this);
    })();
    const id = $(this).next('div').text().match(/\((\d+)\)$/)[1];
    const userData = client.users.cache.get(id);
    if (userData == null) {
      client.fetchUser(id)
        .then(function(val) {
          chipWrite(val, id, index, thisId);
        })
        .catch(function(res) {
          spawnNotification({
            displayLength: 1000,
            html: `ID「${id}」が見つかりませんでした`,
            classes: 'toast-chips'
          });
          chipWrite(null, id, index, thisId);
        });
    } else {
      chipWrite(userData, id, index, thisId);
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
      Swal.fire(
        'おっと？',
        '「コメント」は必須です',
        'warning'
      );
      return;
    }
    Swal.fire({
      title: '以下の内容で送信します',
      html: html,
      type: 'question',
      showCancelButton: true,
      confirmButtonColor: '#3949ab',
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
          spawnNotification({
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
          spawnNotification({
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
  // お知らせチェック
  $(document).on('click', '#notification', function() {
    $('#modal_notification .collection').addClass('hide');
    $('#modal_notification .preloader-wrapper').removeClass('hide');
    $('#modal_notification > .modal-content > div > div:nth-child(1) > p').removeClass('hide');
    M.Modal.getInstance($('#modal_notification')).open();
    $('#modal_notification .modal-content').scrollTop(0);
    $.get(`${postUrl}?t=notification`, null)
      // サーバーからの返信を受け取る
      .done(function(data) {
        debugLog('[notification] click done data', data);
        const storage = localStorage.getItem('notificationLog');
        let html = '';
        let logAry = [];
        if (data.length == null) {
          spawnNotification({
            html: 'おしらせの取得に失敗しました<br>時間を置いて再度お試し下さい',
            classes: 'toast-notification'
          });
          M.Modal.getInstance($('#modal_notification')).close();
          if (storage != null) logAry = storage;
          return;
        } else if (data.length === 0) {
          html += `<li class="collection-item left-align"><p>新しいお知らせはありませんでした…っ！ (っ◞‸◟c)</p></li>`;
        } else {
          for (let i = 0, n = data.length; i < n; i++) {
            const time = whatTimeIsIt(data[i].time);
            const title = data[i].title;
            const message = markdown.markdown.toHTML(data[i].message, 'Gruber').replace(/~~([^~]+)~~/g, '<del>$1</del>');
            html += `<li class="collection-item left-align"><p>${title} (${time})</p><div>${message}</div></li>`;
            logAry.push(data[i].time);
          }
        }
        const emoji = twemoji.parse(html);
        localStorage.setItem('notificationLog', JSON.stringify(logAry));
        $('#notification').removeClass('red-text text-accent-1');
        $('#modal_notification ul').html(emoji);
        $('#modal_notification .collection').removeClass('hide');
        $('#modal_notification .preloader-wrapper').addClass('hide');
        $('#modal_notification > .modal-content > div > div:nth-child(1) > p').addClass('hide');
        $('#modal_notification a[href^=http]').attr('target', '_blank').attr('draggable', 'false');
      })
      // 通信エラーの場合
      .fail(function(data) {
        spawnNotification({
          html: 'おしらせの取得に失敗しました<br>時間を置いて再度お試し下さい',
          classes: 'toast-notification'
        });
        M.Modal.getInstance($('#modal_notification')).close();
        debugLog('[notification] click fail data', data);
      });
  });
  // デバッグ
  $(document).on('click', '#info button:eq(0)', function() {
    debugNum++;
    if (4 < debugNum && debugNum < 10) {
      const num = 10 - debugNum;
      spawnNotification({
        html: `デバッグの許可まであと${num}回`,
        classes: `toast-chips debug-last${num}`
      });
    } else if (debugNum == 10) {
      spawnNotification({
        html: 'デバッグをONにしました',
        classes: 'toast-chips debug-on'
      });
      $('#dispeak > div:last-child').removeClass('display-none');
      $('#dispeak input[name=debug]').prop('checked', true);
      writeFile();
    }
  });
  // 画像クリックでIDをコピー
  $(document).on('click', '#log img', function(event) {
    if (objectCheck(setting, 'dispeak.debug') && event.ctrlKey && event.shiftKey) console.log(this_variable_is_error); // デバッグ用
    const userid = $(this).data('userid');
    if (userid == null) return;
    const result = copyTextToClipboard(userid);
    const text = (function() {
      if (result) return 'コピーに成功しました。'
      return 'コピーに失敗しました。'
    })();
    spawnNotification({
      html: `ユーザーID: ${userid}<br>${text}`
    });
    debugLog('[logImg] userid', userid);
  });
  // スポイラーをクリック
  $(document).on('click', '.spoiler-text, .spoiler-image', function() {
    $(this).addClass('spoiler-non');
  });
  // $filename$の設定
  $(document).on('click', '#files-list button', function() {
    const text = $(this).children('i').text();
    debugLog('[files-list] text', text);
    if (/add/.test(text)) {
      Swal.mixin({
          input: 'text',
          confirmButtonColor: '#3949ab',
          confirmButtonText: '次へ &rarr;',
          cancelButtonText: 'キャンセル',
          showCancelButton: true,
          progressSteps: ['1', '2']
        })
        .queue([{
            title: 'MIMEタイプを記入',
            html: '例）「image/&#x2A;」「image/png」など',
            confirmButtonText: '次へ &rarr;',
            inputValidator: (value) => {
              return !value && 'MIMEタイプは必須です'
            }
          },
          {
            title: '読み方を記入',
            text: '例）「画像ファイル」など',
            confirmButtonText: '登録'
          }
        ])
        .then((result) => {
          debugLog('[files-list add] result', result);
          if (result.value) {
            const mime = result.value[0].replace(/"|\s/, '');
            const read = result.value[1];
            const html =
              '<tr>' +
              `<td class="input-field"><input name="files_mime_${mime}_add" type="text" value="${mime}" readonly></td>` +
              `<td class="input-field"><input name="files_read_${mime}_add" type="text" value="${read}"></td>` +
              '<td><button class="btn-flat waves-effect waves-light" type="button"><i class="material-icons">close</i></button></td>' +
              '</tr>';
            if (mime === '') {
              Swal.fire(
                'おっと？',
                'そのMIMEタイプは追加できません',
                'warning'
              );
            } else if ($(`#files-list input[name="files_mime_${mime}_add"]`).length || /^(image|audio|video|text|\*)\/\*$/.test(mime)) {
              Swal.fire(
                'おっと？',
                'そのMIMEタイプは追加されています',
                'warning'
              );
            } else {
              $('#files-list tbody').prepend(html);
              writeFile();
            }
          }
        });
    } else if (/close/.test(text)) {
      $(this).parents('tr').remove();
      writeFile();
    } else if (/replay/.test(text)) {
      $(this).parents('tr').find('[data-template]').each(function() {
        const data = $(this).data('template');
        $(this).children('input').val(data);
      });
      writeFile();
    }
  });
  // NGリスト
  $(document).on('click', '#ngword-list button', function() {
    const text = $(this).children('i').text();
    debugLog('[ngword-list] text', text);
    if (/close/.test(text)) {
      $(this).parents('tr').remove();
      writeFile();
    }
  });
  // 通知テスト
  $(document).on('click', '#notification_normal, #notification_html', function() {
    const date = whatTimeIsIt();
    const text = ($(this).attr('id') === 'notification_normal') ?
      `${date}<br>これは通常の通知です` :
      `<i class="material-icons yellow-text text-accent-1">info_outline</i><span>${date}<br>これは一部の通知です</span>`;
    const classes = ($(this).attr('id') === 'notification_normal') ? 'toast-test' : 'toast-error';
    spawnNotification({
      html: text,
      classes: classes
    });
    $('#notification_normal, #notification_html').addClass('disabled');
    debugLog('[notification_test] date', date);
    setTimeout(() => $('#notification_normal, #notification_html').removeClass('disabled'), 4500);
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
  $('#whitelist > .row.section').eq(0).addClass('display-none');
  $('#whitelist > .row.section').eq(1).removeClass('display-none');
  spawnNotification({
    html: 'Discordのログインに成功しました',
    classes: 'toast-discord'
  });
  // アカウント
  const user = client.user;
  const userId = user.id;
  //const avatarURL = user.displayAvatarURL.replace(/\?size=\d+/, '');
  const avatarURL = `https://cdn.discordapp.com/avatars/${userId}/${user.avatar}.png`;
  const username = user.username;
  const discriminator = user.discriminator;
  $('#discord_token').prop('disabled', true);
  $('#discord-profile img').attr('src', avatarURL);
  $('#discord-profile p').eq(1).text(`${username}#${discriminator}`);
  localStorage.setItem('DiscordLoginId', userId); // 最後にログインしたIDを保存しておく
  const loginTime = whatTimeIsIt();
  const loginHtml = `${loginTime} [info]<br>Discordのログインに成功しました`;
  logProcess(loginHtml, avatarURL, userId);
  // 各チャンネル
  client.channels.cache.map(function(val, key) {
    // ダイレクトメッセージ
    if (val.type == 'dm') {
      //const avatarURL = val.recipient.displayAvatarURL.replace(/\?size=\d+/, '');
      const avatarURL = `https://cdn.discordapp.com/avatars/${val.recipient.id}/${val.recipient.avatar}.png`;
      const name = escapeHtml(val.recipient.username);
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
      const name = (function() {
        const usernames = val.recipients.map(function(v) {
          return escapeHtml(v.username);
        }).join(', ');
        if (val.name == null) return usernames;
        return val.name;
      })();
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
      const c_name = escapeHtml(val.name);
      const s_id = val.guild.id;
      const s_name = escapeHtml(val.guild.name);
      const s_iconURL = (function() {
        //if (val.guild.iconURL == null) return 'images/group.svg';
        //return val.guild.iconURL.replace(/\?size=\d+/, '');
        if (val.guild.icon == null) return 'images/group.svg';
        return `https://cdn.discordapp.com/icons/${val.guild.id}/${val.guild.icon}`;
      })();
      if (document.getElementById(s_id) == null) {
        $('#server-list').append(
          `<div id="${s_id}" class="collection-item row">` +
          `<div class="collection-item avatar valign-wrapper"><img src="${s_iconURL}" alt="" class="circle"><span class="title">${s_name}</span></div>` +
          '<div class="col s12 row section right-align">' +
          '<div class="col s6 valign-wrapper"><div class="col s10"><strong>チャットの読み上げ</strong></div><div class="col s2 switch right-align"><label><input name="chat" type="checkbox"><span class="lever"></span></label></div></div>' +
          '<div class="col s6 valign-wrapper"><div class="col s10"><strong>ボイスチャンネルの通知</strong></div><div class="col s2 switch right-align"><label><input name="voice" type="checkbox"><span class="lever"></span></label></div></div>' +
          '</div>' +
          '<div class="col s12 row section right-align display-none">' +
          '<div class="col s12 row section right-align">' +
          `<div class="col s2 row input-field"><input id="${s_id}_voice" name="b_voice" type="number" value="" min="0" max="65535"><label for="${s_id}_voice">声質</label></div>` +
          `<div class="col s2 row input-field"><input id="${s_id}_volume" name="b_volume" type="number" value="" min="0" max="65535"><label for="${s_id}_volume">音量</label></div>` +
          `<div class="col s2 row input-field"><input id="${s_id}_speed" name="b_speed" type="number" value="" min="0" max="65535"><label for="${s_id}_speed">速度</label></div>` +
          `<div class="col s2 row input-field"><input id="${s_id}_tone" name="b_tone" type="number" value="" min="0" max="65535"><label for="${s_id}_tone">音程</label></div>` +
          `<div class="col s2 row input-field"></div>` +
          `<div class="col s2 row input-field"><input id="${s_id}_command" name="b_command" type="text" value=""><label for="${s_id}_command">コマンド</label></div>` +
          '</div>' +
          '</div>' +
          '</div>'
        );
      }
      $(`#${s_id} .display-none`).append(`<div class="col s6 valign-wrapper"><div class="col s9">${c_name}</div><div class="col s3 switch right-align"><label><input name="${c_id}" type="checkbox" checked><span class="lever"></span></label></div></div>`);
    }
  });
  // 絵文字
  client.guilds.cache.map(function(v, k) {
    const server_name = escapeHtml(v.name);
    const server_iconURL = (function() {
      //if (v.iconURL == null) return 'images/group.svg';
      //return v.iconURL.replace(/\?size=\d+/, '');
      if (v.icon == null) return 'images/group.svg';
      return `https://cdn.discordapp.com/icons/${v.id}/${v.icon}`;
    })();
    let html = `<li><div class="collapsible-header valign-wrapper"><img src="${server_iconURL}" alt="" class="circle">${server_name}</div><div class="collapsible-body">`;
    v.emojis.cache.map(function(val, key) {
      const emoji_name = escapeHtml(val.name);
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
    $('#whitelist > .row.section').eq(0).removeClass('display-none');
    $('#whitelist > .row.section').eq(1).addClass('display-none');
    $('#blacklist .chip').each(function(i) {
      const id = $(this).text().replace(/[^0-9]/g, '');
      const userData = client.users.cache.get(id);
      if (userData == null) {
        client.fetchUser(id)
          .then(function(val) {
            chipWrite(val, id, i, 'blacklist');
          })
          .catch(function(res) {
            chipWrite(null, id, i, 'blacklist');
          });
      } else {
        chipWrite(userData, id, i, 'blacklist');
      }
    });
    $('#whitelist .chip').each(function(i) {
      const id = $(this).text().replace(/[^0-9]/g, '');
      const userData = client.users.cache.get(id);
      if (userData == null) {
        client.fetchUser(id)
          .then(function(val) {
            chipWrite(val, id, i, 'whitelist');
          })
          .catch(function(res) {
            chipWrite(null, id, i, 'whitelist');
          });
      } else {
        chipWrite(userData, id, i, 'whitelist');
      }
    });
  }, 1000 * 10);
  // tokenが変わったとき設定がリセットされるのを防ぐために処理を行なう
  const sStorage = sessionStorage.getItem('DiscordLoginError');
  debugLog('[Discord] sessionStorage', sStorage);
  if (sStorage == null) {
    readFile(); // 設定ファイルを反映
    writeFile();
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
  const reconnecting = objectCheck(setting, 'dispeak.reconnecting');
  if (!reconnecting) return;
  spawnNotification({
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
  debugLog('[Discord] voiceStateUpdate server[guildId]', objectCheck(setting, `server.${guildId}`));
  if (setting.server[guildId] == null) return; // settingがない場合は読まない
  if (setting.server[guildId].voice == false) return; // settingがfalseのとき読まない
  const authorBot = oldMember.user.bot; // 参加者・退出者がBOTならtrue
  const settingBotChat = objectCheck(setting, 'dispeak.bot_chat');
  debugLog('[Discord] voiceStateUpdate authorBot', authorBot);
  if (authorBot && !settingBotChat) return; // BOTが入退出したとき、読み上げない設定の場合は処理を行わない
  const guildChannel = oldMember.guild.channels; // サーバのチャンネル一覧を取得
  // 切断チャンネル（old:123456789012345678, new:null）
  const channelPrevID = oldMember.voiceChannelID;
  const channelPrevName = (function() {
    if (channelPrevID == null ) return '';
    const channelPrevData = guildChannel.cache.get(channelPrevID);
    if (channelPrevData == null) return '';
    return channelPrevData.name;
  })();
  // 参加チャンネル（old:null, new:123456789012345678）
  const channelNextID = newMember.voiceChannelID;
  const channelNextName = (function() {
    if (channelNextID == null ) return '';
    const channelNextData = guildChannel.cache.get(channelNextID);
    if (channelNextData == null) return '';
    return channelNextData.name;
  })();
  // ブラックリストの処理
  debugLog('[Discord] voiceStateUpdate dispeak.blacklist', objectCheck(setting, 'dispeak.blacklist'));
  const blacklist = setting.blacklist;
  for (let i = 0, n = blacklist.length; i < n; i++) {
    const blacklistTag = blacklist[i].tag;
    if (blacklistTag == oldMember.id) return;
  }
  // ホワイトリストの処理
  debugLog('[Discord] voiceStateUpdate dispeak.whitelist', objectCheck(setting, 'dispeak.whitelist'));
  if (objectCheck(setting, 'dispeak.whitelist')) {
    const whitelist = setting.whitelist;
    if (whitelist.indexOf(oldMember.id) == -1) return;
  }
  // 参加中の通話かチェック
  const voiceChannelMembers = (function() {
    if (oldMember.voiceChannel != null) return oldMember.voiceChannel.members; // 退出時
    if (newMember.voiceChannel != null) return newMember.voiceChannel.members; // 参加時
  })();
  debugLog('[Discord] voiceStateUpdate voiceChannelMembers', voiceChannelMembers);
  let inTheCall = false;
  voiceChannelMembers.forEach(function(val, key) {
    if (client.user.id === key) inTheCall = true;
  });
  const notInVc = objectCheck(setting, 'dispeak.not_in_vc');
  if (!inTheCall && !notInVc) return;
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
  //const avatarURL = oldMember.user.displayAvatarURL.replace(/\?size=\d+/, '');
  const avatarURL = `https://cdn.discordapp.com/avatars/${oldMember.user.id}/${oldMember.user.avatar}.png`;
  const template_bymRep = template_bym
    .replace(/\$time\$/, time).replace(/\$server\$/, guildName).replace(/\$channel\$/, channelName)
    .replace(/\$channel-prev\$/, channelPrevName).replace(/\$channel-next\$/, channelNextName)
    .replace(/\$userid\$/, oldMember.id).replace(/\$username\$/, username).replace(/\$nickname\$/, nickname).replace(/\$memo\$/, note);
  const template_logRep = template_log
    .replace(/\$time\$/, time).replace(/\$server\$/, escapeHtml(guildName)).replace(/\$channel\$/, escapeHtml(channelName))
    .replace(/\$channel-prev\$/, escapeHtml(channelPrevName)).replace(/\$channel-next\$/, escapeHtml(channelNextName))
    .replace(/\$userid\$/, oldMember.id).replace(/\$username\$/, escapeHtml(username)).replace(/\$nickname\$/, escapeHtml(nickname)).replace(/\$memo\$/, note);
  let set = {};
  set.voice = setting.server[guildId].b_voice;
  set.volume = setting.server[guildId].b_volume;
  set.speed = setting.server[guildId].b_speed;
  set.tone = setting.server[guildId].b_tone;
  const templateCommand = setting.server[guildId].b_command;
  const template_bymRepAdd = `${templateCommand}${template_bymRep}`;
  bouyomiSpeak(template_bymRepAdd, set);
  logProcess(template_logRep, avatarURL, oldMember.id);
});
// チャットが送信された時
client.on('message', function(data) {
  debugLog('[Discord] message', data);
  const userId = client.user.id; // 自分のID
  const authorId = data.author.id; // チャットユーザーのID
  const authorBot = data.author.bot; // チャットユーザーがBOTならtrue
  const settingMyChat = setting.dispeak.my_chat;
  const settingOtherChat = setting.dispeak.other_chat;
  const settingBotChat = objectCheck(setting, 'dispeak.bot_chat');
  if (userId == authorId && !settingMyChat) return; // 自分が発言したとき、読み上げない設定の場合は処理を行わない
  if (userId != authorId && !settingOtherChat) return; // 他人が発言したとき、読み上げない設定の場合は処理を行わない
  if (authorBot && !settingBotChat) return; // BOTが発言したとき、読み上げない設定の場合は処理を行わない
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
  if (channelType == 'directmessage' && userId == authorId) {
    // DMで発言者が自分、ただし該当DMが読まない設定の時
    const recipientId = data.channel.recipient.id;
    if (!setting.directmessage[recipientId]) return;
  } else if (channelType == 'directmessage' && userId != authorId) {
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
  // ホワイトリストの処理
  if (objectCheck(setting, 'dispeak.whitelist')) {
    const whitelist = setting.whitelist;
    if (whitelist.indexOf(authorId) == -1) return;
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
    if (data.channel.name == null) return obj;
    return data.channel.name;
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
  //const avatarURL = data.author.displayAvatarURL.replace(/\?size=\d+/, '');
  const avatarURL = (function(){
    if (data.author.avatar == null) return data.author.defaultAvatarURL;
    return `https://cdn.discordapp.com/avatars/${data.author.id}/${data.author.avatar}.png`;
  })();
  // チャットの内容
  let content = data.content;
  // NGワードの処理
  const ngwordlist = objectCheck(setting, 'ngword');
  debugLog('[Discord] ngwordlist', ngwordlist);
  const ngwordres = (function(){
    for (let ngwordkey in ngwordlist) {
      const ngword = ngwordlist[ngwordkey];
      const ngwordReg = new RegExp(ngword);
      const test = ngwordReg.test(content);
      if (test) return true;
    }
    return false;
  })();
  debugLog('[Discord] ngwordres', ngwordres);
  if (ngwordres) return;
  // チャンネルの処理
  const contentMatchChannel = content.match(/<#([0-9]*?)>/g);
  if (contentMatchChannel != null) {
    for (let i = 0, n = contentMatchChannel.length; i < n; i++) {
      const contentChannel = contentMatchChannel[i];
      const contentChannelId = contentChannel.replace(/[<#>]/g, ''); // IDだけ取り出す
      const contentChannelReg = new RegExp(contentChannel, 'g');
      const channels = data.channel.guild.channels;
      const channel = channels.cache.get(contentChannelId);
      const contentChannelName = channel.name;
      content = content.replace(contentChannelReg, `#${contentChannelName}`);
      debugLog('[Discord] channels', channels);
      debugLog('[Discord] channel', channel);
    }
  }
  // メンションの処理
  const mentionReg = /<@[!&]?([0-9]*?)>/g;
  const contentMatchMention = content.match(mentionReg);
  if (contentMatchMention != null) {
    for (let i = 0, n = contentMatchMention.length; i < n; i++) {
      const contentMention = contentMatchMention[i];
      const isUser= (/&/.test(contentMention)) ? false : true;
      const contentMentionId = contentMention.replace(/[<@!&>]/g, ''); // IDだけ取り出す
      const contentMentionReg = new RegExp(contentMention, 'g');
      const myMention = (function() {
        const tmp = objectCheck(setting, 'dispeak.my_mention_bym');
        if (tmp == null) return '';
        return tmp;
      })();
      const otherMention = (function() {
        const tmp = objectCheck(setting, 'dispeak.other_mention_bym');
        if (tmp == null) return '';
        return tmp;
      })();
      const roleMention = (function() {
        const tmp = objectCheck(setting, 'dispeak.role_mention_bym');
        if (tmp == null) return '';
        return tmp;
      })();
      if (isUser) {
        const mentionUserdata = client.users.cache.get(contentMentionId);
        const mentionUsername = mentionUserdata.username;
        const mentionNickname = (function() {
          if (channelType !== 'server') return mentionUsername;
          const members = (function() {
            if (objectCheck(data, 'member') == null) return data.mentions._guild.members;
            return data.member.guild.members;
          })();
          const member = members.cache.get(contentMentionId);
          const nick = objectCheck(member, 'nickname');
          debugLog('[Discord] members', members);
          debugLog('[Discord] member', member);
          if (nick == null) return mentionUsername;
          return nick;
        })();
        if (!objectCheck(setting, 'dispeak.mention')) {
          content = content.replace(mentionReg, '');
        } else if (contentMentionId == userId) {
          content = content.replace(contentMentionReg, myMention).replace(/\$username\$/, mentionUsername).replace(/\$nickname\$/, mentionNickname);
        } else {
          content = content.replace(contentMentionReg, otherMention).replace(/\$username\$/, mentionUsername).replace(/\$nickname\$/, mentionNickname);
        }
      } else {
        const roles = data.channel.guild.roles;
        const role = roles.cache.get(contentMentionId);
        const roleName = role.name;
        debugLog('[Discord] roles', roles);
        debugLog('[Discord] role', role);
        debugLog('[Discord] roleName', roleName);
        if (!objectCheck(setting, 'dispeak.mention')) {
          content = content.replace(mentionReg, '');
        } else {
          content = content.replace(contentMentionReg, roleMention).replace(/\$role\$/, roleName);
        }
      }
    }
  }
  // 画像の処理
  const filesTemplate = objectCheck(setting, 'dispeak.files_bym');
  const attachmentsSize = data.attachments.size;
  let attachmentsBym = '';
  let attachmentsHtml = '';
  let attachmentsMime = '';
  if (attachmentsSize > 0) {
    debugLog('[Discord] data.attachments', data.attachments);
    let mimeTypeName = ''
    let filelistAry = [];
    let fileHtmlAry = [];
    let fileListHtmlAry = [];
    data.attachments.map(function(val, key) {
      //const filename = val.filename;
      const filename = val.name;
      // ファイル名（スポイラー対応）
      const spoilerText = (function() {
        const spoiler_bym = objectCheck(setting, 'dispeak.spoiler_bym');
        if (spoiler_bym != null) return spoiler_bym;
        return '';
      })();
      const text = (function() {
        if (/^SPOILER_/.test(filename) && !objectCheck(setting, 'dispeak.spoiler')) return spoilerText;
        return filename;
      })();
      filelistAry.push(text);
      // ファイル読み上げのテンプレート処理
      const mimeType = mime.lookup(filename);
      debugLog('[Discord] mimeType', mimeType);
      mimeTypeName = (function() {
        const filesList = objectCheck(setting, 'files-list');
        if (filesList == null || filename == null || !mimeType) return 'ファイル';
        // ソートさせておく
        let filesListKeys = [];
        for (let filesListKey in filesList) filesListKeys.push(filesListKey);
        filesListKeys.sort(function(a, b) {
          const strA = a.toString().toLowerCase();
          const strB  = b.toString().toLowerCase();
          if (strA > strB) {
            return -1;
          } else if (strA < strB) {
            return 1;
          }
          return 0;
        });
        debugLog('[Discord] filesListKeys', filesListKeys);
        // ソートした結果を元に読み方を返す
        for (let i = 0, n = filesListKeys.length; i < n; i++) {
          const filesListKey = filesListKeys[i]
          const filesListVal = filesList[filesListKey];
          const filesMime = filesListKey.replace(/^files_read_|_add$/g, ''); // "application/*", "image/png,apng"
          const filesMimeRep = filesMime.replace(/\s/g, '').replace(/^\*\//g, '.*/').replace(/\/\*$/g, '/.*').replace(/\/(.+)/g, '/($1)').replace(/,/g, '|'); // "application/(.*)", "image/(png|apng)"
          const filesMimeReg = new RegExp(filesMimeRep);
          if (filesMimeReg.test(mimeType)) return filesListVal;
        }
        return 'ファイル';
      })();
      attachmentsMime = mimeType;
      // 画像のHTMLを生成
      const url = val.url;
      const html = (function() {
        if (!mimeType || !/^image/.test(mimeType)) return '';
        if (/^SPOILER_/.test(filename) && !objectCheck(setting, 'dispeak.spoiler')) return `<span class="spoiler-image"><span class="spoiler-image-warning">spoiler</span><span class="spoiler-image-filter"><img class="thumbnail" src="${url}" alt="${filename}"></span></span>`;
        return `<img class="thumbnail" src="${url}" alt="${filename}">`;
      })();
      fileHtmlAry.push(html);
      // ファイルリスト化 ( https://cdn.jsdelivr.net/gh/jshttp/mime-db@master/db.json )
      //const filesize = calculationByteSize(val.filesize);
      const filesize = calculationByteSize(val.size);
      const listIcon = (function() {
        if (!mimeType) return 'description';
        // 一般的
        if (/^application\//.test(mimeType)) return 'description';
        if (/^audio\//.test(mimeType)) return 'library_music';
        if (/^font\//.test(mimeType)) return 'font_download';
        if (/^image\//.test(mimeType)) return 'photo_library';
        if (/^text\//.test(mimeType)) return 'library_books';
        if (/^video\//.test(mimeType)) return 'video_library';
        // メール
        if (/^message\//.test(mimeType)) return 'email';
        if (/^multipart\//.test(mimeType)) return 'email';
        // 化学系ソフト
        if (/^chemical\//.test(mimeType)) return 'description';
        // CADなどの2D・3Dソフト
        if (/^model\//.test(mimeType)) return 'description';
        // その他
        if (/^example\//.test(mimeType)) return 'description';
        if (/^x-conference\//.test(mimeType)) return 'description';
        if (/^x-shader\//.test(mimeType)) return 'description';
        return 'description';
      })();
      const sizeAndMime = (function() {
        if (!mimeType) return filesize;
        return `${filesize}, ${mimeType}`;
      })();
      const listHtml =
        `<span class="file-list-log">` +
        `<a class="truncate" href="${url}" target="_blank"><i class="material-icons tiny">${listIcon}</i><span>${filename}</span></a>` +
        `<span>(${sizeAndMime})</span>` +
        `</span>`;
      fileListHtmlAry.push(listHtml);
    });
    debugLog('[Discord] mimeTypeName', mimeTypeName);
    debugLog('[Discord] filelistAry', filelistAry);
    debugLog('[Discord] fileHtmlAry', fileHtmlAry);
    debugLog('[Discord] fileListHtmlAry', fileListHtmlAry);
    if (objectCheck(setting, 'dispeak.files_chat') && filesTemplate != null) {
      const filelist = filelistAry.join(', ');
      attachmentsBym += filesTemplate.replace(/\$filename\$/, mimeTypeName).replace(/\$filenum\$/, attachmentsSize).replace(/\$filelist\$/, filelist);
    }
    if (objectCheck(setting, 'dispeak.image_log')) {
      attachmentsHtml += fileHtmlAry.join('');
    }
    if (objectCheck(setting, 'dispeak.files_log')) {
      attachmentsHtml += fileListHtmlAry.join('');
    }
  }
  // 画像がない＆メッセージがないときは処理を終了（埋め込み・ピン止めなど）
  if (attachmentsSize === 0 && content === '') return;
  // 送信するテキストを作成（$time$ $server$ $channel$ $group$ $channel-prev$ $channel-next$ $username$ $nickname$ $memo$ $text$）
  let sendTextToBouyomi = (function() {
    // スポイラーの処理
    const spoilerText = (function() {
      const spoiler_bym = objectCheck(setting, 'dispeak.spoiler_bym');
      if (spoiler_bym != null) return spoiler_bym;
      return '';
    })();
    const sendContent = (function() {
      let sendContent = content;
      // スポイラーの処理
      if (!objectCheck(setting, 'dispeak.spoiler')) {
        const sendContentMatch = sendContent.match(/([^`]+(?=`[^`]+`)|[^`]+$)/g);
        debugLog('[Discord] bym sendContentMatch', sendContentMatch);
        if (sendContentMatch) {
          for (let i = 0, n = sendContentMatch.length; i < n; i++) {
            const matchRep = sendContentMatch[i].replace(/\|\|(.*?)\|\|/g, spoilerText);
            const sendRep = sendContent.replace(sendContentMatch[i], matchRep);
            sendContent = sendRep;
            debugLog('[Discord] bym matchRep', matchRep);
            debugLog('[Discord] bym sendRep', sendRep);
          }
          debugLog('[Discord] bym sendContent', sendContent);
        }
      }
      return sendContent;
    })();
    // テンプレートの処理
    let tmp = template_bym
      .replace(/\$time\$/, time).replace(/\$server\$/, guildName).replace(/\$channel\$/, channelName).replace(/\$group\$/, groupName)
      .replace(/\$userid\$/, authorId).replace(/\$username\$/, username).replace(/\$nickname\$/, nickname).replace(/\$memo\$/, note).replace(/\$text\$/, sendContent);
    // 画像の処理
    tmp += ` ${attachmentsBym}`;
    return tmp;
  })();
  let sendTextToLog = (function() {
    // チャットをエスケープ処理する
    let sendContent = escapeHtml(content);
    // 絵文字の処理をする
    sendContent = sendContent
      .replace(/&lt;(:[a-zA-Z0-9!-/:-@¥[-`{-~]+:)([0-9]+)&gt;/g, '<img class="emoji" src="https://cdn.discordapp.com/emojis/$2.png" alt="$1" draggable="false">')
      .replace(/&lt;a(:[a-zA-Z0-9!-/:-@¥[-`{-~]+:)([0-9]+)&gt;/g, '<img class="emoji" src="https://cdn.discordapp.com/emojis/$2.gif" alt="$1" draggable="false">');
    // スポイラーの処理
    if (!objectCheck(setting, 'dispeak.spoiler')) {
      const sendContentMatch = sendContent.match(/([^`]+(?=`[^`]+`)|[^`]+$)/g);
      debugLog('[Discord] text sendContentMatch', sendContentMatch);
      if (sendContentMatch) {
        for (let i = 0, n = sendContentMatch.length; i < n; i++) {
          const matchRep = sendContentMatch[i].replace(/\|\|(.*?)\|\|/g, '<span class="spoiler-text">$1</span>');
          const sendRep = sendContent.replace(sendContentMatch[i], matchRep);
          sendContent = sendRep;
          debugLog('[Discord] text matchRep', matchRep);
          debugLog('[Discord] text sendRep', sendRep);
        }
        debugLog('[Discord] text sendContent', sendContent);
      }
    }
    // テンプレートの処理
    let tmp = template_log
      .replace(/\$time\$/, time).replace(/\$server\$/, escapeHtml(guildName)).replace(/\$channel\$/, escapeHtml(channelName)).replace(/\$group\$/, escapeHtml(groupName))
      .replace(/\$userid\$/, authorId).replace(/\$username\$/, escapeHtml(username)).replace(/\$nickname\$/, escapeHtml(nickname)).replace(/\$memo\$/, note).replace(/\$text\$/, sendContent);
    // 画像の処理
    if (content === '') {
      tmp += `${attachmentsHtml}`;
    } else {
      tmp += `<br>${attachmentsHtml}`;
    }
    return tmp;
  })();
  // 棒読みちゃんの各種設定
  let set = (function(){
    let obj = {};
    obj.voice = setting[channelType].b_voice;
    obj.volume = setting[channelType].b_volume;
    obj.speed = setting[channelType].b_speed;
    obj.tone = setting[channelType].b_tone;
    obj.command = setting[channelType].b_command;
    if (guildId != '') {
      const voice = objectCheck(setting, `server.${guildId}.b_voice`);
      const volume = objectCheck(setting, `server.${guildId}.b_volume`);
      const speed = objectCheck(setting, `server.${guildId}.b_speed`);
      const tone = objectCheck(setting, `server.${guildId}.b_tone`);
      const command = objectCheck(setting, `server.${guildId}.b_command`);
      if (voice.length) obj.voice = voice;
      if (volume.length) obj.volume = volume;
      if (speed.length) obj.speed = speed;
      if (tone.length) obj.tone = tone;
      if (command.length) obj.command = command;
    }
    return obj;
  })();
  debugLog('[Discord] set', set);
  if (set.command != '') sendTextToBouyomi = `${set.command} ${sendTextToBouyomi}`;
  // テキストが存在しないときの処理
  if (content === '' || /^([\s]+)$/.test(content)) {
    if (objectCheck(setting, 'dispeak.files_chat')) bouyomiSpeak(sendTextToBouyomi, set);
    if (objectCheck(setting, 'dispeak.image_log') || objectCheck(setting, 'dispeak.files_log')) logProcess(sendTextToLog, avatarURL, authorId);
  } else {
    bouyomiSpeak(sendTextToBouyomi, set);
    logProcess(sendTextToLog, avatarURL, authorId);
  }
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
ipcRenderer.on('resize-textarea', (event) => {
  debugLog('[resize-textarea] event', event);
  M.textareaAutoResize($('#request_textarea'));
});
ipcRenderer.on('log-error', (event, jsn) => {
  const obj = JSON.parse(jsn);
  errorLog(obj);
});
ipcRenderer.on('log-debug', (event, title, data) => {
  debugLog(title, data);
});
// ログを保存する
ipcRenderer.on('saving-log-create', (event) => {
  let txtlogAry = [];
  $('#log > div > .collection > .collection-item').each(function() {
    const userid = $(this).children('img').data('userid');
    const contents = $(this).children('p').html();
    const contentsText = contents.replace(/<br>/g, '\n').replace(/<img(.*?)>|<span(.+)\/span>/g, '').trim();
    let txtlogObj = {}
    txtlogObj.userid = userid;
    txtlogObj.contents = contentsText;
    txtlogAry.push(txtlogObj);
  });
  debugLog('[saving-log-create]', txtlogAry);
  ipcRenderer.send('saving-log-return', JSON.stringify(txtlogAry, null, 2));
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
    debugLog(`[readFile] data(${id})`, data);
    for (let name in data) {
      const val = data[name];
      const type = toString.call(val);
      // オブジェクト（serverのみ）
      if (/object Object/.test(type) && /server/.test(id)) {
        for (let serverName in val) {
          const serverVal = val[serverName];
          const serverValType = toString.call(serverVal);
          if (/object Boolean/.test(serverValType)) {
            $(`#${name} input[name="${serverName}"]`).prop('checked', serverVal);
          } else {
            $(`#${name} input[name="${serverName}"][type=number], #${name} input[name="${serverName}"][type=text]`).val(serverVal);
          }
        }
      }
      // チェックボックス
      else if (/object Boolean/.test(type)) {
        $(`#${id} input[name="${name}"]`).prop('checked', val);
        if(name === 'tab_fixed' && val) {
          $('main').addClass('tab-fixed');
          $('.tabs').parent().addClass('z-depth-1');
        }
      }
      // $filename$の設定
      else if (/^files_mime/.test(name)) {
        return;
      } else if (/^files_read_(.+)_add/.test(name)) {
        const readName = name;
        const readVal = val;
        const mimeName = readName.replace('files_read_', 'files_mime_');
        const mimeVal = readName.replace(/files_read_|_add/g, '');
        const html =
          '<tr>' +
          `<td class="input-field"><input name="${mimeName}" type="text" value="${mimeVal}" readonly></td>` +
          `<td class="input-field"><input name="${readName}" type="text" value="${readVal}"></td>` +
          '<td><button class="btn-flat waves-effect waves-light" type="button"><i class="material-icons">close</i></button></td>' +
          '</tr>';
        $('#files-list tbody').prepend(html);
      }
      else if (/^ngword_/.test(name)) {
        const html =
          '<tr>' +
          `<td class="input-field" data-template="ngword"><input name="${name}" type="text" value="${val}" readonly></td>` +
          '<td><button class="btn-flat waves-effect waves-light" type="button"><i class="material-icons">close</i></button></td>' +
          '</tr>';
        $('#ngword-list tbody').append(html);
      }
      // それ以外
      else {
        $(`#${id} input[name="${name}"]`).val([val]);
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
  // 上に戻るボタン
  backToTop();
}
// ファイルへ書き込み
function writeFile() {
  let setting_AutoSave = {};
  $('#dispeak, #discord, #directmessage, #group, #bouyomi, #server .template, #server-list > div, #emojis, #ngword').each(function() {
    const divId = $(this).attr('id');
    const id = (function() {
      if (divId == null) return 'server';
      return divId;
    })();
    let parentObj = {};
    let inputObj = {};
    let mimeObj = {};
    $(this).find('input').each(function() {
      const input = $(this);
      const name = input.attr('name');
      const val = (function() {
        if (input.attr('type') == 'checkbox') return input.prop('checked');
        if (input.attr('type') == 'radio') return $(`input:radio[name="${name}"]:checked`).val();
        return input.val();
      })();
      // $filename$の設定
      if (/^files_mime/.test(name)) {
        return;
      } else if (/^files_read/.test(name)) {
        mimeObj[name] = val;
      } else if (name != null) {
        inputObj[name] = val;
      }
    });
    parentObj[id] = inputObj;
    parentObj['files-list'] = mimeObj;
    if (!/\d+/.test(id)) {
      $.extend(true, setting_AutoSave, parentObj);
    } else {
      $.extend(true, setting_AutoSave.server, parentObj);
    }
  });
  setting_AutoSave.blacklist = M.Chips.getInstance($('#blacklist .chips')).chipsData;
  setting_AutoSave.whitelist = M.Chips.getInstance($('#whitelist .chips')).chipsData;
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
    spawnNotification({
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
      //client.user.setStatus(client.user.settings.status);
      //client.user.settings.update('status', client.user.settings.status);
      //writeFile();
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
        トークンの取得方法については<a href="https://github.com/micelle/DiSpeak/wiki/06.GetTokenAndId" target="_blank">こちら</a>をご参考ください。`;
        logProcess(loginHtml, 'images/discord.png');
        spawnNotification({
          html: 'ログインに失敗しました',
          classes: 'toast-discord'
        });
      } else {
        erroeObj(err);
      }
    });
}
// チップ
function chipWrite(userData, tag, len, listId) {
  debugLog('[Discord] onChipAdd', userData);
  if (userData == null) {
    $(`#${listId} .chip`).eq(len).html(`<img src="images/discord.png"><div>- (${tag})</div><i class="material-icons close">close</i>`);
  } else {
    const userName = escapeHtml(userData.username);
    const userDiscriminator = userData.discriminator;
    //const useAvatarURL = userData.displayAvatarURL.replace(/\?size=\d+/, '');
    const useAvatarURL = `https://cdn.discordapp.com/avatars/${userData.id}/${userData.avatar}.png`;
    $(`#${listId} .chip`).eq(len).html(`<img src="${useAvatarURL}"><div>${userName}#${userDiscriminator} (${tag})</div><i class="material-icons close">close</i>`);
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
  // 既にログインしていた場合
  if (loginDiscordCheck) {
    $(`#${thisId}`).addClass('display-none');
    $(`#${siblingsId}`).removeClass('display-none');
    if (thisId == 'start') {
      bouyomiSpeakCheck = true; // 読み上げる状態に変更
      spawnNotification({
        html: '再生を開始しています',
        classes: 'toast-bouyomi'
      });
      bouyomiExeStart();
    } else if (thisId == 'stop') {
      bouyomiSpeakCheck = false; // 読み上げない状態に変更
      spawnNotification({
        html: '再生を停止しました',
        classes: 'toast-bouyomi'
      });
    }
  }
  // まだログインしていない場合
  else {
    spawnNotification({
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
    spawnNotification({
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
    spawnNotification({
      html: `棒読みちゃんを起動できませんでした<br>ディレクトリを間違えていないかご確認ください<br>${bouyomiDir}`,
      classes: 'toast-bouyomiExe'
    });
  }
}
// 棒読みちゃんにdataを渡す
function bouyomiSpeak(data, set) {
  debugLog(`[bouyomiSpeak] data (retry${bouyomiRetryNum + 1})`, data);
  debugLog(`[bouyomiSpeak] set (retry${bouyomiRetryNum + 1})`, set);
  debugLog('[bouyomiSpeak] bouyomiSpeakCheck', bouyomiSpeakCheck);
  debugLog('[bouyomiSpeak] bouyomiExeStartCheck', bouyomiExeStartCheck);
  if (!bouyomiSpeakCheck || !bouyomiExeStartCheck || bouyomiRetryNum>=10) return;
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
  if (message != lastMessage) bouyomiRetryNum = 0;
  lastMessage = message;
  debugLog('[bouyomiSpeak] message', message);
  if (objectCheck(setting, 'bouyomi.communication') === 'http') {
    const encodeURI = encodeURIComponent(message);
    const port = objectCheck(setting, 'bouyomi.port_http');
    const url = `http://localhost:${port}/talk?text=${encodeURI}`
    http.get(url, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
          body += chunk;
      });
      res.on('end', (res) => {
          res = JSON.parse(body);
          debugLog('[bouyomiSpeak] res', res);
      });
    }).on('error', (e) => {
      debugLog('[bouyomiSpeak] error', e);
      debugLog('[bouyomiSpeak] bouyomiRetryNum', bouyomiRetryNum);
      if (bouyomiRetryNum >= 10) {
        bouyomiRetryNum = 0;
        erroeObj(e);
      } else {
        setTimeout(function() {
          bouyomiSpeak(message, set);
        }, 100);
      }
    });
    return;
  }
  const setSpeed = (function() {
    const s = objectCheck(set, 'speed');
    if (s == null || s === '') return 0xFFFF;
    const s16 = Number(s).toString(16);
    return Number(`0x${s16}`);
  })();
  const setTone = (function() {
    const s = objectCheck(set, 'tone');
    if (s == null || s === '') return 0xFFFF;
    const s16 = Number(s).toString(16);
    return Number(`0x${s16}`);
  })();
  const setVolume = (function() {
    const s = objectCheck(set, 'volume');
    if (s == null || s === '') return 0xFFFF;
    const s16 = Number(s).toString(16);
    return Number(`0x${s16}`);
  })();
  const setVoice = (function() {
    const s = objectCheck(set, 'voice');
    if (s == null || s === '') return 0x0000;
    const s16 = Number(s).toString(16);
    return Number(`0x${s16}`);
  })();
  debugLog('[bouyomiSpeak] setSpeed', setSpeed);
  debugLog('[bouyomiSpeak] setTone', setTone);
  debugLog('[bouyomiSpeak] setVolume', setVolume);
  debugLog('[bouyomiSpeak] setVoice', setVoice);
  const bouyomiClient = net.createConnection(options, () => {
    debugLog('[bouyomiSpeak] start', '');
    debugLog('[bouyomiSpeak] bouyomiClient', bouyomiClient);
  });
  bouyomiClient.on('connect', () => {
    debugLog('[bouyomiSpeak] connect', '');
    const messageBuffer = Buffer.from(message);
    const buffer = Buffer.alloc(15 + messageBuffer.length);
    buffer.writeUInt16LE(0x0001, 0);
    buffer.writeUInt16LE(setSpeed, 2); // 速度 speed
    buffer.writeUInt16LE(setTone, 4); // 音程 tone
    buffer.writeUInt16LE(setVolume, 6); // 音量 volume
    buffer.writeUInt16LE(setVoice, 8); // 声質 voice
    buffer.writeUInt8(0x00, 10);
    buffer.writeUInt32LE(messageBuffer.length, 11);
    messageBuffer.copy(buffer, 15, 0, messageBuffer.length);
    bouyomiClient.write(buffer);
    debugLog('[bouyomiSpeak] messageBuffer', messageBuffer);
    debugLog('[bouyomiSpeak] buffer', buffer);
  });
  // エラー（接続できなかったときなど）
  bouyomiClient.on('error', (e) => {
    debugLog('[bouyomiSpeak] error', e);
    if (bouyomiRetryNum >= 10) {
      bouyomiRetryNum = 0;
      erroeObj(e);
      bouyomiClient.end();
    } else {
      setTimeout(function() {
        bouyomiSpeak(message, set);
      }, 100);
    }
  });
  bouyomiClient.on('data', (e) => {
    debugLog('[bouyomiSpeak] data', e);
    bouyomiClient.end();
  });
  // 接続が完了したとき
  bouyomiClient.on('end', () => {
    debugLog('[bouyomiSpeak] end', '');
    bouyomiRetryNum = 0;
  });
}
// 通知
function spawnNotification(obj) {
  const body = obj.html.replace(/<br>/g, '\n');
  const classes = obj.classes;
  const displayLength = obj.displayLength;
  const title = 'DiSpeak';
  const classesLength = $(`.${classes}`).length;
  const isHtml = /<\//.test(body);
  const notification_d = objectCheck(setting, 'dispeak.notification_d');
  const notification_w = objectCheck(setting, 'dispeak.notification_w');
  if (!notification_d && !isHtml) obj.classes = `${classes} display-none`;
  if (!classesLength) {
    M.toast(obj);
    if (notification_w && !isHtml) {
      let myNotification = new Notification(title, {
        body: body,
        icon: `${__dirname}\\images\\icon.png`,
      });
      setTimeout(myNotification.close.bind(myNotification), 4000);
    }
  }
}
// クリップボードへコピー
function copyTextToClipboard(textVal) {
  const temp = document.createElement('div');
  temp.appendChild(document.createElement('pre')).textContent = textVal;
  const s = temp.style;
  s.position = 'fixed';
  s.left = '-100%';
  document.body.appendChild(temp);
  document.getSelection().selectAllChildren(temp);
  const result = document.execCommand('copy');
  document.body.removeChild(temp);
  return result;
}
// ログを書き出す
function logProcess(html, image, userId) {
  debugLog('[logProcess] html', html);
  const htmlAdd = `<li class="collection-item avatar valign-wrapper"><img src="${image}" class="circle" data-userid="${userId}"><p>${html}</p></li>`;
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
// お知らせを定期チェック
function getNotificationJson() {
  const storage = localStorage.getItem('notificationLog');
  $.get(`${postUrl}?t=notification`, null)
    .done(function(data) {
      debugLog('[notification] setTimeout done data', data);
      debugLog('[notification] setTimeout done storage', storage);
      if (!$('#notification').hasClass('hide')) $('#notification').addClass('hide').removeClass('red-text text-accent-1'); // 表示されていたら隠す
      if (data == null || data.length === 0) return; // 通知データがなければそのまま
      const dataLen = data.length;
      let count = 0;
      if (dataLen > 0) {
        $('#notification').removeClass('hide'); // 通知データがあった場合、表示させてから既読・未読をチェック
        if (storage == null) {
          $('#notification').addClass('red-text text-accent-1');
        } else {
          for (let i = 0; i < dataLen; i++) {
            const dataTime = data[i].time;
            debugLog('[notification] setTimeout done dataTime', dataTime);
            if (storage.indexOf(dataTime) >= 0) count++;
          }
          if (dataLen > count) $('#notification').addClass('red-text text-accent-1');
        }
      }
    });
  const time = 1000 * 60 * 10;
  setTimeout(function() {
    getNotificationJson();
  }, time);
}
// 更新履歴を反映
function release(data) {
  let html = '';
  let num = 0;
  let latestreleaseAry = [];
  for (let i = 0, n = data.length; i < n; i++) {
    const prerelease = data[i].prerelease;
    const url = data[i].html_url;
    const tag = data[i].tag_name;
    const name = data[i].name;
    const id = data[i].id;
    const time = whatTimeIsIt(data[i].published_at);
    const text = markdown.markdown.toHTML(data[i].body, 'Gruber').replace(/~~([^~]+)~~/g, '<del>$1</del>');
    const badge = (function() {
      if (prerelease) return '<span class="new badge pre-release" data-badge-caption="Pre-release"></span>';
      if (!prerelease && latestreleaseAry.length === 0) return '<span class="new badge" data-badge-caption="Latest release"></span>';
      return '';
    })();
    const nowVer = nowVersion.replace(/^(\d+\.\d+)\.\d+.*/, '$1');
    const nowVerReg = new RegExp(`^v${nowVer}`);
    const classActive = (function() {
      if (nowVerReg.test(tag)) return 'active';
      return '';
    })();
    if (!prerelease) latestreleaseAry.push(id);
    html +=
      `<li id="release-${id}" class="${classActive}">` +
      `<div class="collapsible-header valign-wrapper"><i class="material-icons">library_books</i>${tag} (${time})${badge}</div>` +
      `<div class="collapsible-body"><p><a href="${url}" target="_blank">${name}</a></p><p>${text}</p></div>` +
      '</li>';
  }
  const emoji = twemoji.parse(html);
  $('#release ul').append(emoji);
  $('#release a[href^=http]').attr('target', '_blank').attr('draggable', 'false');
  M.Collapsible.init($('.collapsible.expandable'), {
    accordion: false
  });
}
// 上に戻るボタン
function backToTop() {
  const mainHasTabFixed = $('main').hasClass('tab-fixed');
  const scrollTargetClass = (!mainHasTabFixed) ? 'main' : '.contents';
  $(scrollTargetClass).scroll(function () {
    const btn = $('.fixed-action-btn:eq(1)');
    const scroll = $(this).scrollTop();
    (scroll > 180) ? btn.fadeIn() : btn.fadeOut();
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
// バイト計算
function calculationByteSize(size) {
  const unitList = ['B', 'KB', 'MB', 'GB', 'TB'];
  let sizeNum = (function() {
    if (typeof size === 'string') return Number(size.replace(/[^0-9]/g, ''));
    if (typeof size === 'number') return size;
    return 0;
  })();
  let unitSelect = unitList[0];
  for (let i = 1, n = unitList.length; i < n; i++) {
    if (sizeNum >= 1024) {
      sizeNum = sizeNum / 1024;
      unitSelect = unitList[i];
    }
  }
  return Math.round(sizeNum * 10) / 10 + unitSelect;
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
  // Discord.js側のエラー
  if (/channelClass is not a constructor/.test(msg)) return;
  const msgTxt = (function() {
    if (/Incorrect login details were provided/.test(msg)) return 'トークンが正しくありません';
    if (/Something took too long to do/.test(msg)) return 'Discordに接続できません';
    if (/getaddrinfo ENOTFOUND/.test(msg)) return 'IPが正しくありません';
    if (/"port" option should be/.test(msg)) return 'ポートが正しくありません';
    if (/Port should be > 0 and < 65536/.test(msg)) return 'ポートが正しくありません';
    if (/connect ECONNREFUSED \d+\.\d+\.\d+\.\d+:\d+/.test(msg)) return '棒読みちゃんが起動していない、もしくは接続できません';
    if (/\$ is not a function/.test(msg)) return 'エラーが発生しました<br>Ctrl+Rで画面を更新して下さい';
    // 改修済みの不具合
    if (/Syntax error, unrecognized expression: #files-list input/.test(msg)) return '古いバージョンを利用中です<br>最新版にアップデートして下さい';
    // 原因不明のエラー
    if (/read ECONNRESET/.test(msg)) return `Discordに接続できません<br>引き続き起きる場合はDiSpeakやパソコン、<br>ネットワークの再起動もお試し下さい`; // Discord.jsの問題？
    if (/connect ETIMEDOUT/.test(msg)) return `棒読みちゃんにアクセスできません<br>同一ポートを使用しているソフトがある場合、<br>閉じてからお試し下さい`; // 他のソフトと競合？
    if (/Can not find Squirrel/.test(msg)) return `アップデートを行えません<br>再起動しても直らない場合は手動でアップデートを行ってください`; // 自動更新周りのエラー？
    if (/AutoUpdater process with arguments/.test(msg)) return `アップデートを行えません<br>再起動しても直らない場合は手動でアップデートを行って下さい`; // 自動更新周りのエラー？
    if (/no such file or directory/.test(msg)) return `設定ファイルが見つかりません<br>再起動しても直らない場合は再インストールを行って下さい`; // ファイルが存在しないっぽい？
    // プログラムミスのエラー
    if (/([0-9a-zA-Z]+) is not defined/.test(msg)) return `[${msg}]<br>エラーが発生しました`;
    if (/Cannot read property .+ of null/.test(msg)) return `[${msg}]<br>エラーが発生しました`;
    return `[${msg}]<br>エラーが発生しました`;
  })();
  const homepathAry = homepath.split('\\');
  const username = homepathAry[2];
  const usernameReg = new RegExp(username, 'ig');
  const jsn = JSON.stringify(obj);
  const jsnRep = jsn.replace(usernameReg, '***');
  debugLog(`[errorLog] homepathAry`, homepathAry);
  debugLog(`[errorLog] username`, username);
  debugLog(`[errorLog] jsnRep`, jsnRep);
  if ($('.toast-error').length || msgTxt === '') return;
  const toastHTML = `<i class="material-icons yellow-text text-accent-1">info_outline</i><span>${msgTxt}</span>`;
  spawnNotification({
    html: toastHTML,
    classes: 'toast-error'
  });
  if (pathExe.match(usernameReg) == null || !/AppData\\Local\\DiSpeak\\app-/.test(pathExe)) return; // インストール先に存在しない場合のは送らないよ
  if (objectCheck(setting, 'dispeak.errorlog') && /\[.+]<br>/.test(msgTxt)) $.post(`${postUrl}?t=e`, jsnRep);
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