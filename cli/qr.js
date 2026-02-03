#!/usr/bin/env node
/**
 * QR 코드로 서브디바이스 로그인
 *
 * 사용법:
 *   node cli/qr.js
 *   node cli/qr.js --device-uuid <uuid>
 */
const { loadLibrary, runBot, saveAuth } = require('./_common');
const { KakaoBot } = loadLibrary();
const qrcode = require('qrcode-terminal');

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { transport: 'brewery' };
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--device-name': case '-n': opts.deviceName = args[++i]; break;
      case '--model-name': case '-m':  opts.modelName = args[++i]; break;
      case '--device-uuid': case '-u': opts.deviceUuid = args[++i]; break;
      case '--forced': case '-f':      opts.forced = true; break;
      case '--transport':             opts.transport = (args[++i] || '').toLowerCase(); break;
      case '--loco':                  opts.transport = 'loco'; break;
      case '--both':                  opts.transport = 'both'; break;
      case '--brewery':               opts.transport = 'brewery'; break;
      case '--help': case '-h':
        console.log(`사용법: node cli/qr.js [옵션]

옵션:
  -n, --device-name <name>    기기 이름 (기본: KakaoForge Bot)
  -m, --model-name <model>    모델명 (기본: KakaoForge)
  -u, --device-uuid <uuid>    디바이스 UUID (미지정 시 자동 생성)
  -f, --forced                다른 서브디바이스 강제 로그아웃
  -h, --help                  도움말

QR URL이 출력되면 주 기기 카카오톡 > 설정 > QR 스캔으로 인증하세요.`);
        console.log('Transport: --transport <brewery|loco|both> (default: brewery), --loco, --both');
        process.exit(0);
    }
  }
  return opts;
}

async function main() {
  const opts = parseArgs();
  const transport = (opts.transport || 'brewery').toLowerCase();
  const useBrewery = transport !== 'loco';

  const bot = new KakaoBot({
    deviceUuid: opts.deviceUuid || '',
  });

  try {
    await bot.loginQR({
      deviceName: opts.deviceName || 'SM-T733',
      modelName: opts.modelName || 'SM-T733',
      forced: opts.forced || false,
      useBrewery,
      onQrUrl: (url) => {
        console.log('\n  주 기기 카카오톡에서 아래 QR을 스캔하세요:\n');
        qrcode.generate(url, { small: true }, (qr) => {
          console.log(qr);
        });
        console.log(`  ${url}\n`);
      },
      onPasscode: (passcode) => {
        const big = {
          '0': [' 000 ','0   0','0   0','0   0',' 000 '],
          '1': ['  1  ',' 11  ','  1  ','  1  ',' 111 '],
          '2': [' 222 ','2   2','  2  ',' 2   ','22222'],
          '3': ['3333 ','    3',' 333 ','    3','3333 '],
          '4': ['4   4','4   4','44444','    4','    4'],
          '5': ['55555','5    ','5555 ','    5','5555 '],
          '6': [' 666 ','6    ','6666 ','6   6',' 666 '],
          '7': ['77777','   7 ','  7  ',' 7   ',' 7   '],
          '8': [' 888 ','8   8',' 888 ','8   8',' 888 '],
          '9': [' 999 ','9   9',' 9999','    9',' 999 '],
        };
        // 이전 Waiting 로그를 지우기 위해 화면 클리어
        process.stdout.write('\x1B[2J\x1B[H');
        console.log('\n  QR 스캔 완료! 인증번호:\n');
        for (let row = 0; row < 5; row++) {
          const line = passcode.split('').map(d => big[d][row]).join('   ');
          console.log('      ' + line);
        }
        console.log('\n  Phone에서 위 번호를 확인하세요\n');
      },
    });

    if (transport === 'both') {
      try {
        await bot.connect();
      } catch (err) {
        console.error('[!] LOCO connect failed:', err.message);
      }
    }

    saveAuth({
      userId: bot.userId,
      accessToken: bot.oauthToken,
      refreshToken: bot.refreshToken,
      deviceUuid: bot.deviceUuid,
    });

    runBot(bot);
  } catch (err) {
    console.error('\nQR 로그인 실패:', err.message);
    bot.disconnect();
    process.exit(1);
  }
}

main();
