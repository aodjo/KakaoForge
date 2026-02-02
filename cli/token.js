#!/usr/bin/env node
/**
 * 저장된 토큰 또는 직접 지정으로 Brewery 연결
 *
 * 사용법:
 *   node cli/token.js                          # auth.json에서 로드
 *   node cli/token.js --token <token> --uuid <uuid>
 */
const { KakaoBot } = require('../src/index');
const { prompt, runBot, loadAuth } = require('./_common');

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
        console.log(`사용법: node cli/token.js [옵션]

옵션:
  -i, --user-id <id>      카카오 유저 ID (숫자)
  -t, --token <token>     OAuth 액세스 토큰
  -u, --uuid <uuid>       디바이스 UUID
  -d, --debug             디버그 모드 (모든 이벤트 로깅)
  -h, --help              도움말

옵션 미지정 시 auth.json에서 저장된 토큰을 로드합니다.
auth.json은 cli/qr.js 로그인 시 자동 생성됩니다.`);
        process.exit(0);
    }
  }
  return opts;
}

async function main() {
  const opts = parseArgs();

  let userId, oauthToken, deviceUuid;

  if (opts.oauthToken) {
    // CLI 인자로 직접 지정
    userId = opts.userId || 0;
    oauthToken = opts.oauthToken;
    deviceUuid = opts.deviceUuid || '';
  } else {
    // auth.json에서 로드
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
    useSub: true,
    debug: opts.debug || false,
  });

  try {
    await bot.connectBrewery();
    runBot(bot);
  } catch (err) {
    console.error('\n연결 실패:', err.message);
    bot.disconnect();
    process.exit(1);
  }
}

main();
