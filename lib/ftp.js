const FtpDeploy = require('ftp-deploy');
const ftpDeploy = new FtpDeploy();
const setting = require('./setting.json');

// 現在の親ディレクトリを取得
const dir = __dirname.replace(/lib$/g, '');

// FTP 接続先情報
const user = setting['user'];
const password = setting['password'];
const host = setting['host'];
const config = {
  user: user,
  password: password,
  host: host,
  port: 21,
  localRoot: `${dir}release`,
  remoteRoot: setting['dir'], // リモートのルートとなるディレクトリを指定
  include: ['*.nupkg', 'RELEASES'], // localRoot 以外に追加でアップしたいファイルがあれば指定する
  exclude: ['*.exe'], // 除外したいファイル
  deleteRemote: false,
  forcePasv: true
};

// FTP 接続しデプロイする
ftpDeploy
  .deploy(config)
  .then(res => console.log("finished:", res))
  .catch(err => console.log(err)
);