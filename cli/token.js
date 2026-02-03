#!/usr/bin/env node
/**
 * 저장된 토큰 또는 직접 지정으로 Brewery 연결
 *
 * 사용법:
 *   node cli/token.js                          # auth.json에서 로드
 *   node cli/token.js --token <token> --uuid <uuid>
 */
const { loadLibrary, runBot, loadAuth } = require('./_common');
const { KakaoBot } = loadLibrary();

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { watchIds: [], transport: 'brewery' };
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--user-id': case '-i':     opts.userId = parseInt(args[++i]); break;
      case '--token': case '-t':       opts.oauthToken = args[++i]; break;
      case '--uuid': case '-u':        opts.deviceUuid = args[++i]; break;
      case '--debug': case '-d':       opts.debug = true; break;
      case '--watch': case '-w':       opts.watchIds.push(args[++i]); break;
      case '--watch-all':           opts.watchAll = true; break;
      case '--autowatch':           opts.autoWatchInterval = parseInt(args[++i]); break;
      case '--sync-interval':          opts.syncInterval = parseInt(args[++i]); break;
      case '--transport':             opts.transport = (args[++i] || '').toLowerCase(); break;
      case '--loco':                  opts.transport = 'loco'; break;
      case '--both':                  opts.transport = 'both'; break;
      case '--brewery':               opts.transport = 'brewery'; break;
      case '--help': case '-h':
        console.log(`Usage: node cli/token.js [options]

Options:
  -i, --user-id <id>      Kakao user id (number)
  -t, --token <token>     OAuth access token
  -u, --uuid <uuid>       Device UUID
  -d, --debug             Debug mode (log all events)
  -w, --watch <chatId>    Watch a chat (repeatable)
  --watch-all             Watch all chats (from lastMessageId)
  --autowatch <ms>        Auto watch all chats (refresh list)
  --sync-interval <ms>    Sync interval (default: 3000ms)
  -h, --help              Show help

If no options are provided, auth.json is used.
auth.json is created by cli/qr.js.

Examples:
  node cli/token.js -w 12345 -w 67890 --sync-interval 5000`);
        console.log('Transport: --transport <brewery|loco|both> (default: brewery), --loco, --both');
        process.exit(0);
    }
  }
  return opts;
}

async function main() {
  const opts = parseArgs();
  const transport = (opts.transport || 'brewery').toLowerCase();

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
    syncInterval: opts.syncInterval || 3000,
  });

  try {
    if (transport === 'loco') {
      await bot.connect();
    } else {
      await bot.connectBrewery();
      if (transport === 'both') {
        try {
          await bot.connect();
        } catch (err) {
          console.error('[!] LOCO connect failed:', err.message);
        }
      }
    }

    // Auto-watch chat rooms if specified via CLI
    if (opts.watchAll) {
      try {
        await bot.watchAllChats();
        bot.startSync();
      } catch (err) {
        console.error('[!] watch-all failed:', err.message);
      }
    }
    if (opts.autoWatchInterval) {
      bot.startAutoWatchAll({ intervalMs: opts.autoWatchInterval });
    }

    if (opts.watchIds.length > 0) {
      for (const chatId of opts.watchIds) {
        bot.watchChat(chatId);
      }
      bot.startSync();
    }

    runBot(bot);
  } catch (err) {
    console.error('\n연결 실패:', err.message);
    bot.disconnect();
    process.exit(1);
  }
}

main();
