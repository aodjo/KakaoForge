#!/usr/bin/env node
/**
 * 이메일/패스워드로 서브디바이스 로그인
 *
 * 사용법:
 *   node cli/login.js
 *   node cli/login.js --email user@example.com
 *   node cli/login.js --email user@example.com --device-uuid <uuid>
 */
const { KakaoBot } = require('../src/index');
const { prompt, promptPassword, runBot } = require('./_common');

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {};
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--email': case '-e':       opts.email = args[++i]; break;
      case '--device-name': case '-n': opts.deviceName = args[++i]; break;
      case '--model-name': case '-m':  opts.modelName = args[++i]; break;
      case '--device-uuid': case '-u': opts.deviceUuid = args[++i]; break;
      case '--forced': case '-f':      opts.forced = true; break;
      case '--help': case '-h':
        console.log(`사용법: node cli/login.js [옵션]

옵션:
  -e, --email <email>         카카오 계정 이메일
  -n, --device-name <name>    기기 이름 (기본: KakaoForge Bot)
  -m, --model-name <model>    모델명 (기본: KakaoForge)
  -u, --device-uuid <uuid>    디바이스 UUID (미지정 시 자동 생성)
  -f, --forced                다른 서브디바이스 강제 로그아웃
  -h, --help                  도움말`);
        process.exit(0);
    }
  }
  return opts;
}

async function main() {
  const opts = parseArgs();

  const email = opts.email || await prompt('이메일: ');
  const password = await promptPassword('패스워드: ');

  if (!email || !password) {
    console.error('이메일과 패스워드를 입력해주세요.');
    process.exit(1);
  }

  const bot = new KakaoBot({
    useSub: true,
    deviceUuid: opts.deviceUuid || '',
  });

  try {
    await bot.login({
      email,
      password,
      deviceName: opts.deviceName || 'KakaoForge Bot',
      modelName: opts.modelName || 'KakaoForge',
      forced: opts.forced || false,
    });

    runBot(bot);
  } catch (err) {
    console.error('\n로그인 실패:', err.message);
    bot.disconnect();
    process.exit(1);
  }
}

main();
