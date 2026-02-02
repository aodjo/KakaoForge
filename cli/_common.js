const readline = require('readline');
const fs = require('fs');
const path = require('path');

const AUTH_FILE = path.join(__dirname, '..', 'auth.json');

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
          await bot.sendMessage(chatId, text);
          console.log('[+] 전송 완료');
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
        console.log('[*] 채팅 폴더 조회 중...');
        const result = await bot.getChatFolders();
        if (result.folderInfoList && result.folderInfoList.length > 0) {
          let totalChats = 0;
          console.log(`[+] 폴더 ${result.folderInfoList.length}개 (revision=${result.revision}):`);
          for (const folder of result.folderInfoList) {
            const ids = folder.chatIds || [];
            totalChats += ids.length;
            console.log(`  폴더 "${folder.name}" (id=${folder.id}): 채팅방 ${ids.length}개`);
            for (const chatId of ids) {
              console.log(`    chatId=${chatId}`);
            }
          }
          console.log(`[+] 총 채팅방: ${totalChats}개`);
        } else {
          console.log('[*] 폴더 목록이 비어있습니다.');
          console.log('[*] raw:', JSON.stringify(result, null, 2));
        }
      } catch (err) {
        console.error('[!] getChatFolders 실패:', err.message);
        // Fallback: try chat tab settings
        try {
          console.log('[*] chat/tab/settings 시도 중...');
          const tabResult = await bot.getChatTabSettings();
          console.log('[+] 채팅 탭 설정:', JSON.stringify(tabResult, null, 2));
        } catch (err2) {
          console.error('[!] 탭 설정도 실패:', err2.message);
        }
      }
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
    savedAt: new Date().toISOString(),
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
