const FtpDeploy = require('ftp-deploy');
const ftpDeploy = new FtpDeploy();
const setting = require('./setting.json');

// 現在の親ディレクトリを取得
const dir = __dirname.replace(/lib$/g, '');

// FTP 接続先情報
const user = setting['user'];
const password = setting['password'];
const host = setting['host'];

// アップロード中のファイルのログを出力
ftpDeploy.on('uploading', (data) => {
  console.log('Uploading', data);
});
// 1ファイルのアップロードが終わった時にログを出力 (進捗率なども分かる)
ftpDeploy.on('uploaded', (data) => {
  console.log('Uploaded', data);
});
// アップロード中にエラーが発生した場合
ftpDeploy.on('upload-error', (data) => {
  console.log('Upload Error', data);
});
// FTP 接続しデプロイする
ftpDeploy.deploy({
  user: user,
  password: password,
  host: host,
  port: 21,
  localRoot: `${dir}release`,
  remoteRoot: setting['dir'], // リモートのルートとなるディレクトリを指定
  include: ['*.nupkg', 'RELEASES'], // localRoot 以外に追加でアップしたいファイルがあれば指定する
  exclude: ['*.exe'] // 除外したいファイル
}, (error) => {
  if (error) {
    console.log('Error', error);
    return;
  }
  console.log('Deployed');
});