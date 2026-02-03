#!/usr/bin/env node
/**
 * 저장된 토큰 또는 직접 지정으로 LOCO 연결
 *
 * 사용법:
 *   node cli/token.js                          # auth.json에서 로드
 *   node cli/token.js --token <token> --uuid <uuid>
 */
const { loadLibrary, runBot, loadAuth } = require('./_common');
const { KakaoBot } = loadLibrary();

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {};
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--user-id': case '-i':     opts.userId = parseInt(args[++i]); break;
      case '--token': case '-t':       opts.oauthToken = args[++i]; break;
      case '--uuid': case '-u':        opts.deviceUuid = args[++i]; break;
      case '--debug': case '-d':       opts.debug = true; break;
      case '--help': case '-h':
        console.log(`Usage: node cli/token.js [options]

Options:
  -i, --user-id <id>      Kakao user id (number)
  -t, --token <token>     OAuth access token
  -u, --uuid <uuid>       Device UUID
  -d, --debug             Debug mode (log all events)
  -h, --help              Show help

If no options are provided, auth.json is used.
auth.json is created by cli/qr.js.`);
        process.exit(0);
    }
  }
  return opts;
}

async function main() {
  const opts = parseArgs();

  let userId, oauthToken, deviceUuid;

  if (opts.oauthToken) {
    userId = opts.userId || 0;
    oauthToken = opts.oauthToken;
    deviceUuid = opts.deviceUuid || '';
  } else {
    const saved = loadAuth();
    if (!saved) {
      console.error('저장된 인증 정보가 없습니다. 먼저 node cli/qr.js 로 로그인하세요.');
      process.exit(1);
    }
    userId = saved.userId;
    oauthToken = saved.accessToken;
    deviceUuid = saved.deviceUuid;
  }

  const bot = new KakaoBot({
    userId,
    oauthToken,
    deviceUuid,
    debug: opts.debug || false,
  });

  try {
    await bot.connect();
    runBot(bot);
  } catch (err) {
    console.error('\n연결 실패:', err.message);
    bot.disconnect();
    process.exit(1);
  }
}

main();
