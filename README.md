<div align="center">

[![Libaray](https://img.shields.io/badge/Node.js-Library-339933?logo=node.js&logoColor=white)](https://www.npmjs.com/package/kakaoforge)
[![License](https://img.shields.io/badge/License-Custom-informational)](LICENSE)
[![Last Commit](https://img.shields.io/github/last-commit/aodjo/KakaoForge)](https://github.com/aodjo/KakaoForge/commits/main)
[![Commits](https://img.shields.io/github/commit-activity/m/aodjo/KakaoForge)](https://github.com/aodjo/KakaoForge/commits/main)
[![npm version](https://img.shields.io/npm/v/kakaoforge?cache=no)](https://www.npmjs.com/package/kakaoforge)
[![npm downloads](https://img.shields.io/npm/dm/kakaoforge?cache=no)](https://www.npmjs.com/package/kakaoforge)
[![TypeScript](https://img.shields.io/badge/TypeScript-Supported-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Issues](https://img.shields.io/github/issues/aodjo/KakaoForge)](https://github.com/aodjo/KakaoForge/issues)
[![Pull Requests](https://img.shields.io/github/issues-pr/aodjo/KakaoForge)](https://github.com/aodjo/KakaoForge/pulls)

</div>


# KakaoForge

카카오톡 LOCO 프로토콜 기반 Node.js 봇 라이브러리

> 다른 언어로 된 문서가 필요하신가요? 아래 표를 확인해 주세요.

| 언어 | 위치 |
| ---- | --- | 
| Korean | README.md |
| English | docs/README-en.md |

## 목차

- [설치](#설치)
- [빠른 시작](#빠른-시작)
- [주요 기능](#주요-기능)
- [API 레퍼런스](#api-레퍼런스)
- [설정 옵션](#설정-옵션)
- [타입 정의](#타입-정의)
- [예제](#예제)
- [주의사항](#주의사항)
- [라이선스](#라이선스)

---

## 설치

```bash
npm install kakaoforge
```

---

## 빠른 시작

### 1. QR 코드 로그인

처음 사용 시 QR 코드를 통해 인증해야 합니다.
기본적으로 ./auth.json 위치에 로그인 정보가 저장됩니다.

```javascript
const { createAuthByQR } = require('kakaoforge');

// QR 코드가 터미널에 표시됩니다
// 카카오톡 앱에서 QR 코드를 스캔하세요
await createAuthByQR();
```

저장 위치를 변경하려면 `authPath` 옵션을 사용하세요:

```javascript
await createAuthByQR({
    authPath: './config/my-auth.json'  // 원하는 경로 지정
});
```


### 2. 봇 클라이언트 생성

```javascript
const { createClient } = require('kakaoforge');

const client = createClient();
```

옵션을 지정하여 클라이언트를 생성할 수 있습니다:

```javascript
const client = createClient({
    authPath: './auth.json',      // 인증 파일 경로 (기본: './auth.json')
    debug: true,                  // 디버그 로깅 활성화 (기본: false)
    autoConnect: true,            // 자동 연결 (기본: true)
    autoReconnect: true,          // 연결 끊김 시 자동 재연결 (기본: true)
    sendIntervalMs: 400,          // 메시지 전송 간격 제한 (기본: 400ms)
    pingIntervalMs: 60000,        // Ping 간격 (기본: 60초)
});
```

### 3. 메시지 수신 및 응답

```javascript
client.onReady((chat) => {
    console.log('KakaoForge 준비 완료!');
});

client.onMessage(async (chat, msg) => {
    // 자신의 메시지는 무시
    if (msg.sender.id === client.userId) return;

    console.log(`[${msg.sender.name}] ${msg.message.text}`);

    // "안녕"이라고 보내면 "안녕하세요!"로 응답
    if (msg.message.text === '안녕') {
        await chat.sendText(msg.room.id, '안녕하세요!');
    }
});
```

---

## 주요 기능

### 메시지 송수신

```javascript
// 텍스트 메시지
await chat.sendText(roomId, '안녕하세요');

// 답장
await chat.sendReply(roomId, '답장입니다', msg);

// 스레드 댓글
await chat.sendThreadReply(roomId, msg.message.id, '댓글');

// 스레드 댓글 + 채팅방에도 전송
await chat.sendThreadReply(roomId, msg.message.id, '댓글', { sendToChatRoom: true });
```

### 미디어 전송

```javascript
// 사진
await chat.sendPhoto(roomId, '/path/to/image.jpg', { text: '사진 설명' });

// 동영상
await chat.sendVideo(roomId, '/path/to/video.mp4', { text: '동영상 설명' });

// 음성
await chat.sendAudio(roomId, '/path/to/audio.mp3');

// 파일
await chat.sendFile(roomId, '/path/to/file.txt');
```

### 스레드에 미디어 전송

```javascript
await chat.sendPhotoAtThread(roomId, msg.message.id, '/path/to/image.jpg');
await chat.sendVideoAtThread(roomId, msg.message.id, '/path/to/video.mp4');
await chat.sendAudioAtThread(roomId, msg.message.id, '/path/to/audio.mp3');
await chat.sendFileAtThread(roomId, msg.message.id, '/path/to/file.txt');
```

### 멘션 및 스포일러

```javascript
const { Mention, Spoiler } = require('kakaoforge');

// 사용자 멘션
await chat.sendText(roomId, `${Mention(userId)} 안녕하세요!`);

// 스포일러 텍스트
await chat.sendText(roomId, `스포일러: ${Spoiler('비밀 내용')}`);
```

### 이모지 반응

```javascript
const { Reactions } = require('kakaoforge');

await chat.sendReaction(roomId, msg, Reactions.HEART);    // 하트
await chat.sendReaction(roomId, msg, Reactions.LIKE);     // 좋아요
await chat.sendReaction(roomId, msg, Reactions.CHECK);    // 체크
await chat.sendReaction(roomId, msg, Reactions.LAUGH);    // 웃음
await chat.sendReaction(roomId, msg, Reactions.SURPRISE); // 놀람
await chat.sendReaction(roomId, msg, Reactions.SAD);      // 슬픔
await chat.sendReaction(roomId, msg, Reactions.CANCEL);   // 반응 취소
```

### 특수 메시지

```javascript
// 연락처
await chat.sendContact(roomId, {
    name: '홍길동',
    phone: '01012345678',
    email: 'hong@example.com'
});

// 카카오 프로필
await chat.sendKakaoProfile(roomId, { userId: 123456789 }); 

// 위치
await chat.sendLocation(roomId, {
    lat: 37.4979,
    lng: 127.0276,
    address: '서울시 강남구'
});

// 일정
await chat.sendSchedule(roomId, {
    eventAt: new Date('2025-02-15'),
    title: '회의',
    location: '회의실'
});

// 링크
await chat.sendLink(roomId, {
    url: 'https://example.com',
    text: '링크 설명'
});
```

### 메시지 수정 및 삭제

```javascript
// 메시지 수정
const sentMsg = await chat.sendText(roomId, '원본 메시지');
await chat.editMessage(roomId, sentMsg, '수정된 메시지');

// 메시지 삭제
await chat.deleteMessage(roomId, sentMsg);
```

### 오픈채팅 관리

```javascript
const { MemberType } = require('kakaoforge');

// 권한 확인
if (client.type === MemberType.OpenChat.Owner ||
    client.type === MemberType.OpenChat.Manager) {

    // 강제퇴장
    await chat.openChatKick(roomId, memberId);
}
```

### 메시지 조회

```javascript
// 특정 메시지 조회
const message = await chat.fetchMessage(roomId, logId);

// 특정 사용자의 메시지 조회
const messages = await chat.fetchMessagesByUser(roomId, userId, {
    since: 0,
    count: 50,
    maxPages: 5,
});

// 사용자명 조회
const username = await chat.getUsernameById(roomId, userId);
```

---

## API 레퍼런스

### 인증

#### `createAuthByQR(options?)`

QR 코드를 통한 인증을 수행합니다.

```javascript
await createAuthByQR({
    onQrUrl: (url) => console.log('QR URL:', url),
    onPasscode: (code) => console.log('Passcode:', code),
    save: true,  // auth.json에 저장
    authPath: './auth.json'
});
```

### 클라이언트

#### `createClient(config)`

KakaoForge 클라이언트를 생성합니다.

```javascript
const client = createClient({
    authPath: './auth.json',
    debug: true,
    autoConnect: true,
    autoReconnect: true,
    sendIntervalMs: 400,
});
```

### 이벤트 핸들러

#### `client.onReady(callback)`

연결이 완료되면 호출됩니다.

```javascript
client.onReady((chat) => {
    console.log('준비 완료!');
    console.log('User ID:', client.userId);
});
```

#### `client.onMessage(callback)`

메시지를 수신하면 호출됩니다.

```javascript
client.onMessage(async (chat, msg) => {
    console.log('메시지:', msg.message.text);
    console.log('발신자:', msg.sender.name);
    console.log('채팅방:', msg.room.name);
});
```

#### `client.onJoin(callback)`

사용자가 입장하면 호출됩니다.

```javascript
client.onJoin((chat, evt) => {
    console.log('입장:', evt.member.names);
});
```

#### `client.onLeave(callback)`

사용자가 퇴장하면 호출됩니다.

```javascript
client.onLeave((chat, evt) => {
    console.log('퇴장:', evt.member.names);
});
```

#### `client.onInvite(callback)`

사용자가 초대되면 호출됩니다.

```javascript
client.onInvite((chat, evt) => {
    console.log('초대:', evt.member.names);
    console.log('초대한 사람:', evt.actor.name);
});
```

#### `client.onKick(callback)`

사용자가 강제퇴장되면 호출됩니다.

```javascript
client.onKick((chat, evt) => {
    console.log('강제퇴장:', evt.member.names);
});
```

#### `client.onDelete(callback)`

메시지가 삭제되면 호출됩니다.

```javascript
client.onDelete((chat, evt) => {
    console.log('삭제된 메시지');
});
```

#### `client.onHide(callback)`

메시지가 숨겨지면 호출됩니다 (오픈채팅).

```javascript
client.onHide((chat, evt) => {
    console.log('숨겨진 메시지');
});
```

#### `client.onPush(method, callback)`

특정 LOCO push를 직접 수신합니다.

```javascript
client.onPush('SYNCREWR', (payload) => {
    console.log('Raw push:', payload);
});
```

### 메시지 전송

#### `chat.sendText(roomId, text)`

텍스트 메시지를 전송합니다.

```javascript
const sentMsg = await chat.sendText(roomId, '안녕하세요');
```

#### `chat.sendReply(roomId, text, msg)`

메시지에 답장합니다.

```javascript
await chat.sendReply(roomId, '답장입니다', msg);
```

#### `chat.sendThreadReply(roomId, msgId, text, options?)`

스레드에 댓글을 답니다.

```javascript
await chat.sendThreadReply(roomId, msgId, '댓글');

// 채팅방에도 전송
await chat.sendThreadReply(roomId, msgId, '댓글', { sendToChatRoom: true });
```

#### `chat.sendPhoto(roomId, path, options?)`

사진을 전송합니다.

```javascript
await chat.sendPhoto(roomId, '/path/to/image.jpg', { text: '사진' });
```

#### `chat.sendVideo(roomId, path, options?)`

동영상을 전송합니다.

```javascript
await chat.sendVideo(roomId, '/path/to/video.mp4', { text: '동영상' });
```

#### `chat.sendAudio(roomId, path)`

음성 파일을 전송합니다.

```javascript
await chat.sendAudio(roomId, '/path/to/audio.mp3');
```

#### `chat.sendFile(roomId, path)`

파일을 전송합니다.

```javascript
await chat.sendFile(roomId, '/path/to/file.txt');
```

#### `chat.sendReaction(roomId, msg, reactionId)`

이모지 반응을 보냅니다.

```javascript
await chat.sendReaction(roomId, msg, Reactions.HEART);
```

#### `chat.sendContact(roomId, contact)`

연락처를 전송합니다.

```javascript
await chat.sendContact(roomId, {
    name: '홍길동',
    phone: '01012345678',
    email: 'hong@example.com'
});
```

#### `chat.sendKakaoProfile(roomId, options)`

카카오 프로필을 전송합니다.

```javascript
await chat.sendKakaoProfile(roomId, { userId: 123456789 });
```

#### `chat.sendLocation(roomId, location)`

위치를 전송합니다.

```javascript
await chat.sendLocation(roomId, {
    lat: 37.4979,
    lng: 127.0276,
    address: '서울시 강남구',
    title: '장소 이름'
});
```

#### `chat.sendSchedule(roomId, schedule)`

일정을 전송합니다.

```javascript
await chat.sendSchedule(roomId, {
    eventAt: new Date('2025-02-15T10:00:00'),
    title: '회의',
    location: '회의실'
});
```

#### `chat.sendLink(roomId, link)`

링크를 전송합니다.

```javascript
await chat.sendLink(roomId, {
    url: 'https://example.com',
    text: '링크 설명'
});
```

### 메시지 관리

#### `chat.editMessage(roomId, msg, text)`

메시지를 수정합니다.

```javascript
await chat.editMessage(roomId, prevMsg, '수정된 내용');
```

#### `chat.deleteMessage(roomId, msg)`

메시지를 삭제합니다.

```javascript
await chat.deleteMessage(roomId, msg);
```

#### `chat.fetchMessage(roomId, logId)`

특정 메시지를 조회합니다.

```javascript
const message = await chat.fetchMessage(roomId, logId);
```

#### `chat.fetchMessagesByUser(roomId, userId, options)`

특정 사용자의 메시지를 조회합니다.

```javascript
const messages = await chat.fetchMessagesByUser(roomId, userId, {
    since: 0,        // 시작 시점
    count: 50,       // 조회 개수
    maxPages: 5,     // 최대 페이지 수
});
```

### 오픈채팅 관리

#### `chat.openChatKick(roomId, memberId)`

오픈채팅에서 멤버를 강제퇴장시킵니다.

```javascript
await chat.openChatKick(roomId, memberId);
```

### 사용자 정보

#### `chat.getUsernameById(roomId, userId)`

사용자 ID로 닉네임을 조회합니다.

```javascript
const username = await chat.getUsernameById(roomId, userId);
```

---

## 설정 옵션

`createClient(config)`에서 사용할 수 있는 설정 옵션입니다.

```typescript
interface KakaoForgeConfig {
    // 인증
    authPath?: string;           // auth.json 경로 (기본: './auth.json')
    userId?: number;             // 사용자 ID (auth.json에서 로드)
    oauthToken?: string;         // OAuth 토큰 (auth.json에서 로드)
    deviceUuid?: string;         // 디바이스 UUID (auth.json에서 로드)
    refreshToken?: string;       // 리프레시 토큰 (auth.json에서 로드)

    // 연결
    autoConnect?: boolean;       // 자동 연결 (기본: true)
    autoReconnect?: boolean;     // 자동 재연결 (기본: true)
    sendIntervalMs?: number;     // 메시지 전송 간격 제한 (기본: 400)
    reconnectMinDelayMs?: number; // 재연결 최소 대기 시간
    reconnectMaxDelayMs?: number; // 재연결 최대 대기 시간

    // 성능
    pingIntervalMs?: number;     // Ping 간격 (기본: 60000)
    socketKeepAliveMs?: number;  // 소켓 Keep-alive 간격
    memberCacheTtlMs?: number;   // 멤버 캐시 유효 시간
    memberRefreshIntervalMs?: number; // 멤버 새로고침 간격
    memberLookupTimeoutMs?: number;   // 멤버 조회 타임아웃

    // 비디오 설정
    videoQuality?: 'low' | 'high'; // 비디오 품질
    transcodeVideos?: boolean;     // 비디오 트랜스코딩 여부
    ffmpegPath?: string;           // FFmpeg 경로
    ffprobePath?: string;          // FFprobe 경로

    // 디바이스 정보
    deviceId?: string;           // 디바이스 ID
    os?: string;                 // OS 버전
    appVer?: string;             // 앱 버전
    lang?: string;               // 언어 (기본: 'ko')

    // 기타
    debug?: boolean;             // 디버그 로깅 (기본: false)
    timeZone?: string;           // 시간대
}
```

---

## 타입 정의

### MessageEvent

메시지 이벤트의 구조입니다.

```typescript
interface MessageEvent {
    message: {
        id: number | string;        // 메시지 ID
        text: string;               // 메시지 텍스트
        type: number;               // 메시지 타입 (MessageType)
        logId: number | string;     // 로그 ID
    };
    sender: {
        id: number | string;        // 발신자 ID
        name: string;               // 발신자 이름
        type: number;               // 멤버 타입 (오픈채팅)
    };
    room: {
        id: number | string;        // 채팅방 ID
        name: string;               // 채팅방 이름
        isGroupChat: boolean;       // 단체 채팅 여부
        isOpenChat: boolean;        // 오픈채팅 여부
        openLinkId?: number | string; // 오픈채팅 링크 ID
    };
    attachmentsRaw: any[];          // 첨부물 원본 데이터
    raw: any;                       // 원본 LOCO 데이터
}
```

### MessageType

메시지 타입입니다.

```javascript
const { MessageType } = require('kakaoforge');

MessageType.Text;      // 1  - 텍스트
MessageType.Photo;     // 2  - 사진
MessageType.Video;     // 3  - 동영상
MessageType.Contact;   // 4  - 연락처
MessageType.Audio;     // 5  - 음성
MessageType.Link;      // 9  - 링크
MessageType.Schedule;  // 13 - 일정
MessageType.Location;  // 16 - 위치
MessageType.Profile;   // 17 - 프로필
MessageType.File;      // 18 - 파일
MessageType.Reply;     // 26 - 답장
```

### MemberType

오픈채팅 멤버 타입입니다.

```javascript
const { MemberType } = require('kakaoforge');

MemberType.OpenChat.Owner;   // 1 - 방장
MemberType.OpenChat.Member;  // 2 - 일반 멤버
MemberType.OpenChat.Manager; // 4 - 매니저
```

### Reactions

이모지 반응 타입입니다.

```javascript
const { Reactions } = require('kakaoforge');

Reactions.CANCEL;   // 0 - 반응 취소
Reactions.HEART;    // 1 - 하트
Reactions.LIKE;     // 2 - 좋아요
Reactions.CHECK;    // 3 - 체크
Reactions.LAUGH;    // 4 - 웃음
Reactions.SURPRISE; // 5 - 놀람
Reactions.SAD;      // 6 - 슬픔
```

---

## 예제

### 에코 봇

```javascript
const { createClient } = require('kakaoforge');

const client = createClient();

client.onReady(() => {
    console.log('에코 봇 준비 완료!');
});

client.onMessage(async (chat, msg) => {
    if (msg.sender.id === client.userId) return;

    // 받은 메시지를 그대로 전송
    await chat.sendText(msg.room.id, msg.message.text);
});
```

### 명령어 봇

```javascript
const { createClient, Reactions, MemberType, Mention } = require('kakaoforge');

const client = createClient({ authPath: './auth.json' });

client.onMessage(async (chat, msg) => {
    if (msg.sender.id === client.userId) return;

    const text = msg.message.text;
    if (!text) return;

    // !ping 명령어
    if (text === '!ping') {
        await chat.sendText(msg.room.id, 'pong!');
        await chat.sendReaction(msg.room.id, msg, Reactions.CHECK);
    }

    // !info 명령어
    if (text === '!info') {
        await chat.sendText(msg.room.id, `채팅방: ${msg.room.name}\n그룹채팅: ${msg.room.isGroupChat}\n오픈채팅: ${msg.room.isOpenChat}`)
    }

    // !hello
    if (text === '!hello') {
        await chat.sendText(msg.room.id, `${Mention(msg.sender.id)} 안녕하세요!`);
    }
});
```

---

## 주의사항

### 오픈채팅

- 오픈채팅 관리 기능(강제퇴장)을 사용하려면 봇이 **방장** 또는 **매니저** 권한이 있어야 합니다.
- `client.type`으로 봇의 권한을 확인할 수 있습니다.

### 인증 정보

- 로그인 후 인증 정보는 `auth.json` 파일에 저장됩니다.
- 이 파일에는 OAuth 토큰이 포함되어 있으므로 **절대 공개하지 마세요**.
- `.gitignore`에 `auth.json`을 추가하는 것을 권장합니다.

### 연결 유지

- 봇은 자동으로 Ping을 전송하여 연결을 유지합니다.
- 연결이 끊어지면 `autoReconnect` 옵션에 따라 자동 재연결을 시도합니다.

### 메시지 전송 속도 제한

- LOCO 서버는 짧은 시간에 연속 전송 시 `status: -303`으로 WRITE를 거부할 수 있습니다.
- 라이브러리는 기본적으로 `sendIntervalMs`(기본 400ms) 간격으로 전송 큐를 처리합니다.

### 미디어 전송

- 동영상 전송 시 `transcodeVideos` 옵션을 사용하면 자동으로 트랜스코딩됩니다.
- 트랜스코딩을 위해서는 FFmpeg가 설치되어 있어야 합니다.

---

## 라이선스

**Non-Commercial / No Abuse**

- 이 라이브러리는 비상업적 용도로만 사용할 수 있습니다.
- 스팸, 사기, 악의적인 목적으로 사용하는 것은 금지됩니다.
- 자세한 내용은 LICENSE 를 확인하세요.

---

## Github Issue

- 이 라이브러리를 사용하는 중 문제가 발생하였거나 질문이 생겼나요?
- https://github.com/aodjo/KakaoForge/issues
