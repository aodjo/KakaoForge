const readline = require('readline');
const fs = require('fs');
const path = require('path');

const AUTH_FILE = path.join(__dirname, '..', 'auth.json');

function formatKstTimestamp(date = new Date()) {
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().replace('Z', '+09:00');
}

/**
 * readline 기반 프롬프트.
 */
function prompt(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

/**
 * 패스워드 입력 (입력값 숨김).
 */
function promptPassword(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    process.stdout.write(question);
    const stdin = process.stdin;
    const wasRaw = stdin.isRaw;
    if (stdin.isTTY) stdin.setRawMode(true);

    let password = '';
    const onData = (ch) => {
      const c = ch.toString('utf8');
      if (c === '\n' || c === '\r' || c === '\u0004') {
        if (stdin.isTTY) stdin.setRawMode(wasRaw);
        stdin.removeListener('data', onData);
        process.stdout.write('\n');
        rl.close();
        resolve(password);
      } else if (c === '\u007f' || c === '\b') {
        if (password.length > 0) {
          password = password.slice(0, -1);
          process.stdout.write('\b \b');
        }
      } else if (c === '\u0003') {
        // Ctrl+C
        process.exit(0);
      } else {
        password += c;
        process.stdout.write('*');
      }
    };
    stdin.on('data', onData);
  });
}

/**
 * 봇 연결 후 메시지 핸들러 + REPL 설정.
 */
function runBot(bot) {
  const mode = bot.transport || 'unknown';
  console.log(`\n[${mode}] 실시간 이벤트 수신 중`);

  // 메시지 핸들러
  bot.onMessage((msg) => {
    console.log(`[MSG] chatId=${msg.chatId} sender=${msg.sender}: ${msg.text}`);
  });

  // EventEmitter 이벤트 핸들러
  bot.on('ready', () => {
    console.log('[+] 봇 준비 완료');
  });

  bot.on('disconnected', () => {
    console.log('[!] 연결 끊김');
  });

  bot.on('error', (err) => {
    console.error('[!] 오류:', err.message);
  });

  console.log('\n봇이 실행 중입니다. 명령어:');
  console.log('  send <chatId> <메시지>   - 메시지 전송');
  console.log('  watch <chatId>           - 채팅방 메시지 폴링 시작');
  console.log('  unwatch <chatId>         - 채팅방 폴링 중지');
  console.log('  sync <chatId> [count]    - 채팅방 메시지 한번 동기화');
  console.log('  chats                    - 채팅 탭 설정 조회');
  console.log('  watching                 - 폴링 중인 채팅방 목록');
  console.log('  debug                    - 디버그 모드 토글');
  console.log('  status                   - 연결 상태');
  console.log('  quit                     - 종료\n');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: '> ' });
  rl.prompt();

  rl.on('line', async (line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      rl.prompt();
      return;
    }

    if (trimmed === 'quit' || trimmed === 'exit') {
      console.log('종료합니다...');
      bot.disconnect();
      process.exit(0);
    }

    if (trimmed === 'debug') {
      bot.debug = !bot.debug;
      console.log(`[*] 디버그 모드: ${bot.debug ? 'ON' : 'OFF'}`);
    } else if (trimmed === 'status') {
      console.log(`[*] 연결: ${bot.connected ? '연결됨' : '끊김'}`);
      console.log(`[*] 전송 모드: ${bot.transport || 'none'}`);
      console.log(`[*] userId: ${bot.userId}`);
      console.log(`[*] 디버그: ${bot.debug ? 'ON' : 'OFF'}`);
    } else if (trimmed.startsWith('send ')) {
      const rest = trimmed.substring(5).trim();
      const spaceIdx = rest.indexOf(' ');
      if (spaceIdx === -1) {
        console.log('사용법: send <chatId> <메시지>');
      } else {
        const chatId = parseInt(rest.substring(0, spaceIdx));
        const text = rest.substring(spaceIdx + 1);
        try {
          const result = await bot.sendMessage(chatId, text);
          if (result && result.body && result.body.logId) {
            const msgId = result.body.msgId || result.body.msgid || result.body.messageId || '';
            const extra = msgId ? ` msgId=${msgId}` : '';
            console.log(`[+] send ok logId=${result.body.logId}${extra}`);
          } else {
            console.log('[+] send ok');
          }
        } catch (err) {
          console.error('[!] 전송 실패:', err.message);
        }
      }
    } else if (trimmed.startsWith('watch ')) {
      const chatId = trimmed.substring(6).trim();
      if (!chatId) {
        console.log('사용법: watch <chatId>');
      } else {
        bot.watchChat(chatId);
        if (!bot._syncTimer) {
          bot.startSync();
        }
        console.log(`[+] 채팅방 ${chatId} 폴링 시작`);
      }
    } else if (trimmed.startsWith('unwatch ')) {
      const chatId = trimmed.substring(8).trim();
      if (!chatId) {
        console.log('사용법: unwatch <chatId>');
      } else {
        bot.unwatchChat(chatId);
        console.log(`[-] 채팅방 ${chatId} 폴링 중지`);
      }
    } else if (trimmed.startsWith('sync ')) {
      const parts = trimmed.substring(5).trim().split(/\s+/);
      const chatId = parts[0];
      const count = parseInt(parts[1]) || 50;
      if (!chatId) {
        console.log('사용법: sync <chatId> [count]');
      } else {
        try {
          console.log(`[*] 채팅방 ${chatId} 동기화 중 (count=${count})...`);
          const result = await bot.syncMessages(chatId, { count });
          console.log(`[+] 동기화 완료: ${result.content ? result.content.length : 0}개 메시지, size=${result.size}, last=${result.last}`);
          if (result.content) {
            for (const meta of result.content) {
              const preview = (meta.content || '').substring(0, 100);
              console.log(`  logId=${meta.logId} type=${meta.type} chatId=${meta.chatId}: ${preview}`);
            }
          }
        } catch (err) {
          console.error('[!] 동기화 실패:', err.message);
        }
      }
    } else if (trimmed === 'chats' || trimmed === 'chatlist') {
      try {
        console.log('[*] 채팅방 목록 조회 중...');
        const result = await bot.getChatRooms();
        const chats = result.chats || [];
        if (chats.length > 0) {
          console.log(`[+] 채팅방 ${chats.length}개:`);
          for (const chat of chats) {
            const members = chat.displayMembers
              ? chat.displayMembers.map(m => m.nickname || m.nickName || '?').join(', ')
              : '';
            console.log(`  chatId=${chat.chatId} type=${chat.type} unread=${chat.unreadCount || 0} title="${chat.title || ''}" [${members}]`);
          }
        } else {
          console.log('[*] 채팅방 목록이 비어있습니다.');
          console.log('[*] raw:', JSON.stringify(result, null, 2));
        }
      } catch (err) {
        console.error('[!] getChatRooms 실패:', err.message);
      }
    } else if (trimmed === 'probe') {
      // 여러 엔드포인트를 시도해서 채팅방 목록을 찾음
      const paths = [
        '/messaging/chats',
        '/messaging/chats?fetchCount=20',
        '/chat/rooms',
        '/chat/list',
        '/chat/chats',
        '/chats',
        '/chats?fetchCount=20',
        '/alcatraz/chats',
        '/alcatraz/chats?fetchCount=20',
        '/alcatraz/drawer/chats?fetchCount=20',
        '/messaging/chat-folders',
        '/messaging/sync',
        '/sync',
        '/init',
        '/messaging/init',
      ];
      console.log(`[*] ${paths.length}개 엔드포인트 시도 중...`);
      for (const p of paths) {
        try {
          const res = await bot.breweryRequest('GET', p, { timeout: 8000 });
          const body = res.body.toString('utf8').substring(0, 300);
          console.log(`  ${res.status} ${p} → ${body}`);
        } catch (err) {
          console.log(`  ERR ${p} → ${err.message}`);
        }
      }
    } else if (trimmed.startsWith('sendprobe')) {
      const chatId = trimmed.substring(9).trim() || '455007773985318';
      const path = `/messaging/chats/${chatId}/messages`;
      const bodies = [
        { msg: 'test', type: 1 },
        { message: 'test', type: 1 },
        { content: 'test', type: 1 },
        { text: 'test', type: 1 },
        { msg: 'test', type: 1, chatId },
        { message: 'test', messageType: 1 },
        { content: 'test', msgType: 1 },
        { body: 'test', type: 'text' },
        { msg: 'test', type: 1, noSeen: false },
        'msg=test&type=1',
      ];
      const endpoints = bodies.map((b, i) => ['POST', path, b, `body#${i}: ${JSON.stringify(b).substring(0, 60)}`]);
      console.log(`[*] ${path} 에 ${endpoints.length}개 body 변형 시도 중...`);
      for (const [method, p, body, label] of endpoints) {
        try {
          const res = await bot.breweryRequest(method, p, { body, timeout: 8000 });
          const resp = res.body.toString('utf8').substring(0, 300);
          console.log(`  ${res.status} ${label} → ${resp}`);
        } catch (err) {
          console.log(`  ERR ${label} → ${err.message}`);
        }
      }
    } else if (trimmed.startsWith('loco')) {
      // GETCONF → CHECKIN 순서로 시도
      const { BookingClient } = require('../src/net/booking-client');
      const { Long } = require('bson');
      const uid = Long.fromNumber(typeof bot.userId === 'number' ? bot.userId : parseInt(bot.userId));
      console.log(`[*] userId=${bot.userId}`);

      const booking = new BookingClient();
      await booking.connect();
      console.log('[+] Booking 연결됨');

      // Step 1: GETCONF (body: MCCMNC, os, userId만 - GetConfJob.kt 분석 결과)
      console.log('[*] GETCONF 전송...');
      let confBody = null;
      try {
        const confRes = await booking.request('GETCONF', {
          MCCMNC: '450,05',
          os: 'android',
          userId: uid,
        });
        confBody = confRes.body;
        console.log(`[*] GETCONF 응답: status=${confRes.status}, method=${confRes.method}`);
        console.log('[*] GETCONF body:', JSON.stringify(confBody).substring(0, 800));
      } catch (err) {
        console.log(`[!] GETCONF ERR: ${err.message}`);
      }

      // Step 2: CHECKIN (body: userId, os, ntype, appVer, lang, MCCMNC - CheckInJob.kt)
      console.log('[*] CHECKIN 전송...');
      try {
        const checkinRes = await booking.request('CHECKIN', {
          userId: uid,
          os: 'android',
          ntype: 0,
          appVer: '26.1.2',
          lang: 'ko',
          MCCMNC: '450,05',
        });
        console.log(`[*] CHECKIN 응답: status=${checkinRes.status}, method=${checkinRes.method}`);
        console.log('[*] CHECKIN body:', JSON.stringify(checkinRes.body).substring(0, 800));
      } catch (err) {
        console.log(`[!] CHECKIN ERR: ${err.message}`);
      }

      booking.disconnect();
    } else if (trimmed === 'watching') {
      const ids = [...bot._syncChatIds];
      if (ids.length === 0) {
        console.log('[*] 폴링 중인 채팅방 없음');
      } else {
        console.log(`[*] 폴링 중인 채팅방 (${ids.length}개):`);
        for (const id of ids) {
          const room = bot._chatRooms.get(id) || {};
          console.log(`  chatId=${id} lastLogId=${room.lastLogId || 0}`);
        }
      }
      console.log(`[*] 동기화 타이머: ${bot._syncTimer ? 'ON' : 'OFF'}`);
    } else {
      console.log('알 수 없는 명령어. send / watch / unwatch / sync / chats / watching / debug / status / quit');
    }

    rl.prompt();
  });

  rl.on('close', () => {
    bot.disconnect();
    process.exit(0);
  });

  process.on('SIGINT', () => {
    console.log('\n종료합니다...');
    bot.disconnect();
    process.exit(0);
  });
}

/**
 * 인증 정보 저장.
 */
function saveAuth(data) {
  const payload = {
    userId: data.userId,
    accessToken: data.accessToken || data.oauthToken,
    refreshToken: data.refreshToken || '',
    deviceUuid: data.deviceUuid || '',
    savedAt: formatKstTimestamp(),
  };
  fs.writeFileSync(AUTH_FILE, JSON.stringify(payload, null, 2), 'utf-8');
  console.log(`[+] 인증 정보 저장됨: ${AUTH_FILE}`);
  return payload;
}

/**
 * 저장된 인증 정보 로드.
 */
function loadAuth() {
  if (!fs.existsSync(AUTH_FILE)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(AUTH_FILE, 'utf-8'));
    console.log(`[+] 저장된 인증 로드: userId=${data.userId}, saved=${data.savedAt}`);
    return data;
  } catch {
    return null;
  }
}

module.exports = { prompt, promptPassword, runBot, saveAuth, loadAuth, AUTH_FILE };
