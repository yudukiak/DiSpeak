// シート
var ss = SpreadsheetApp.openById(SpreadsheetApp.getActiveSpreadsheet().getId());
var sheet = ss.getSheetByName('POST');
var target = sheet.getRange('A2');
// 現在の時刻を取得
var time = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ssZ').replace(/ /, 'T');
// リザルト
var result = {};
result.content = true;
result.time = time;
// GET
function doGet() {
  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
}
// POST
function doPost(event) {
  var content = event.postData.getDataAsString(); // 結果を取得
  sheet.insertRowAfter(1); // 1行追加
  try {
    jsn(content);
    obj(content);
  } catch (e) {
    target.offset(0, 7).setValue(e); // エラーを書き出し
  } finally {
    return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
  }
}
// JSONの処理
function jsn(content) {
  target.offset(0, 0).setValue(time.replace(/T/, ' ').replace(/\+\d+/, '')); // 受け取った時間
  target.offset(0, 1).setValue(content); // 受け取ったJSON
}
// オブジェクトの処理
function obj(content) {
  var obj = JSON.parse(content); // オブジェクト化
  // スプレッドシートへ書き込み
  target.offset(0, 2).setValue(new Date(obj.time));
  target.offset(0, 3).setValue(obj.version);
  target.offset(0, 4).setValue(obj.process);
  target.offset(0, 5).setValue(obj.message);
  target.offset(0, 6).setValue(obj.stack);
}