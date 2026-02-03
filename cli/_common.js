const readline = require('readline');
const fs = require('fs');
const path = require('path');

const AUTH_FILE = path.join(__dirname, '..', 'auth.json');

function loadLibrary() {
  try {
    return require('../dist/index');
  } catch (err) {
    try {
      require('ts-node/register');
      return require('../src/index');
    } catch (innerErr) {
      const detail = innerErr && innerErr.message ? innerErr.message : String(innerErr);
      throw new Error(`Failed to load KakaoForge. Run "npm run build" or install dev deps. ${detail}`);
    }
  }
}

function formatKstTimestamp(date = new Date()) {
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().replace('Z', '+09:00');
}

function prompt(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

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
        process.exit(0);
      } else {
        password += c;
        process.stdout.write('*');
      }
    };
    stdin.on('data', onData);
  });
}

function runBot(bot) {
  const mode = bot.transport || 'unknown';
  console.log(`\n[${mode}] 실시간 이벤트 수신 중`);

  bot.onMessage((chat, msg) => {
    console.log(`[MSG] chatId=${msg.room.id} sender=${msg.sender.id}: ${msg.message.text}`);
  });

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
  console.log('  chats                    - 채팅방 목록 조회');
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
      console.log('종료합니다..');
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
              : (Array.isArray(chat.displayNickNames) ? chat.displayNickNames.join(', ') : '');
            const title = chat.title || chat.roomName || '';
            console.log(`  chatId=${chat.chatId} type=${chat.type} unread=${chat.unreadCount || 0} title="${title}" [${members}]`);
          }
        } else {
          console.log('[*] 채팅방 목록이 비어있습니다.');
          console.log('[*] raw:', JSON.stringify(result, null, 2));
        }
      } catch (err) {
        console.error('[!] getChatRooms 실패:', err.message);
      }
    } else {
      console.log('알 수 없는 명령어입니다. send / chats / debug / status / quit');
    }

    rl.prompt();
  });

  rl.on('close', () => {
    bot.disconnect();
    process.exit(0);
  });

  process.on('SIGINT', () => {
    console.log('\n종료합니다..');
    bot.disconnect();
    process.exit(0);
  });
}

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

module.exports = { prompt, promptPassword, runBot, saveAuth, loadAuth, AUTH_FILE, loadLibrary };
