#!/usr/bin/env node
/**
 * QR 肄붾뱶濡??쒕툕?붾컮?댁뒪 濡쒓렇?? *
 * ?ъ슜踰?
 *   node cli/qr.js
 *   node cli/qr.js --device-uuid <uuid>
 */
const { loadLibrary, runBot, saveAuth } = require('./_common');
const { KakaoBot } = loadLibrary();

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {};
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--device-name': case '-n': opts.deviceName = args[++i]; break;
      case '--model-name': case '-m':  opts.modelName = args[++i]; break;
      case '--device-uuid': case '-u': opts.deviceUuid = args[++i]; break;
      case '--forced': case '-f':      opts.forced = true; break;
      case '--help': case '-h':
        console.log(`?ъ슜踰?node cli/qr.js [?듭뀡]

?듭뀡:
  -n, --device-name <name>    湲곌린 ?대쫫 (湲곕낯: KakaoForge Bot)
  -m, --model-name <model>    紐⑤뜽紐?湲곕낯: KakaoForge)
  -u, --device-uuid <uuid>    ?붾컮?댁뒪 UUID (誘몄??????먮룞 ?앹꽦)
  -f, --forced                ?ㅻⅨ ?쒕툕?붾컮?댁뒪 媛뺤젣 濡쒓렇?꾩썐
  -h, --help                  ?꾩?留?
QR URL??異쒕젰?섎㈃ ?대???移댁뭅?ㅽ넚 > ?ㅼ젙 > QR 濡쒓렇?몄쓣 ?듯빐 ?뱀씤?섏꽭??`);
        process.exit(0);
    }
  }
  return opts;
}

async function main() {
  const opts = parseArgs();

  const bot = new KakaoBot({
    deviceUuid: opts.deviceUuid || '',
  });

  try {
    await bot.loginQR({
      deviceName: opts.deviceName || 'SM-T733',
      modelName: opts.modelName || 'SM-T733',
      forced: opts.forced || false,
    });

    saveAuth({
      userId: bot.userId,
      accessToken: bot.oauthToken,
      refreshToken: bot.refreshToken,
      deviceUuid: bot.deviceUuid,
    });

    runBot(bot);
  } catch (err) {
    console.error('\nQR 濡쒓렇???ㅽ뙣:', err.message);
    bot.disconnect();
    process.exit(1);
  }
}

main();

