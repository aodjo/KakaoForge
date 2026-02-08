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

A Node.js bot library built on the KakaoTalk LOCO protocol.

> Do you need a document in another language? Please check the document below.

| Lang | Loc |
| ---- | --- | 
| Korean   | README.md |
| English   | docs/README-en.md |

## Table of Contents

- [Notice](#notice)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Key Features](#key-features)
- [API Reference](#api-reference)
- [Configuration Options](#configuration-options)
- [Type Definitions](#type-definitions)
- [Examples](#examples)
- [Important Notes](#important-notes)
- [License](#license)

---

## Notice
- This English document may be outdated.
- For the latest documentation, please refer to the Korean version.

## Installation

```bash
npm install kakaoforge
```

---

## Quick Start

### 1. QR Code Login

You need to authenticate via QR code on first use.
By default, login credentials are saved to `./auth.json`.

```javascript
const { createAuthByQR } = require('kakaoforge');

// A QR code will be displayed in the terminal
// Scan it with the KakaoTalk app
await createAuthByQR();
```

To change the save location, use the `authPath` option:

```javascript
await createAuthByQR({
    authPath: './config/my-auth.json'  // Specify your desired path
});
```


### 2. Creating a Bot Client

```javascript
const { createClient } = require('kakaoforge');

const client = createClient();
```

You can create a client with custom options:

```javascript
const client = createClient({
    authPath: './auth.json',      // Auth file path (default: './auth.json')
    debug: true,                  // Enable debug logging (default: false)
    autoConnect: true,            // Auto-connect on creation (default: true)
    autoReconnect: true,          // Auto-reconnect on disconnect (default: true)
    sendIntervalMs: 400,          // Message send interval limit (default: 400ms)
    pingIntervalMs: 60000,        // Ping interval (default: 60s)
});
```

### 3. Receiving and Responding to Messages

```javascript
client.onReady((chat) => {
    console.log('KakaoForge is ready!');
});

client.onMessage(async (chat, msg) => {
    // Ignore messages from self
    if (msg.sender.id === client.userId) return;

    console.log(`[${msg.sender.name}] ${msg.message.text}`);

    // Reply "Hello!" when someone sends "안녕"
    if (msg.message.text === '안녕') {
        await chat.sendText(msg.room.id, 'Hello!');
    }
});
```

---

## Key Features

### Sending & Receiving Messages

```javascript
// Text message
await chat.sendText(roomId, 'Hello');

// Reply
await chat.sendReply(roomId, 'This is a reply', msg);

// Thread reply
await chat.sendThreadReply(roomId, msg.message.id, 'Comment');

// Thread reply + also send to the chat room
await chat.sendThreadReply(roomId, msg.message.id, 'Comment', { sendToChatRoom: true });
```

### Sending Media

```javascript
// Photo
await chat.sendPhoto(roomId, '/path/to/image.jpg', { text: 'Photo caption' });

// Video
await chat.sendVideo(roomId, '/path/to/video.mp4', { text: 'Video caption' });

// Audio
await chat.sendAudio(roomId, '/path/to/audio.mp3');

// File
await chat.sendFile(roomId, '/path/to/file.txt');
```

### Sending Media in Threads

```javascript
await chat.sendPhotoAtThread(roomId, msg.message.id, '/path/to/image.jpg');
await chat.sendVideoAtThread(roomId, msg.message.id, '/path/to/video.mp4');
await chat.sendAudioAtThread(roomId, msg.message.id, '/path/to/audio.mp3');
await chat.sendFileAtThread(roomId, msg.message.id, '/path/to/file.txt');
```

### Mentions & Spoilers

```javascript
const { Mention, Spoiler } = require('kakaoforge');

// Mention a user
await chat.sendText(roomId, `${Mention(userId)} Hello!`);

// Spoiler text
await chat.sendText(roomId, `Spoiler: ${Spoiler('Hidden content')}`);
```

### Emoji Reactions

```javascript
const { Reactions } = require('kakaoforge');

await chat.sendReaction(roomId, msg, Reactions.HEART);    // Heart
await chat.sendReaction(roomId, msg, Reactions.LIKE);     // Like
await chat.sendReaction(roomId, msg, Reactions.CHECK);    // Check
await chat.sendReaction(roomId, msg, Reactions.LAUGH);    // Laugh
await chat.sendReaction(roomId, msg, Reactions.SURPRISE); // Surprise
await chat.sendReaction(roomId, msg, Reactions.SAD);      // Sad
await chat.sendReaction(roomId, msg, Reactions.CANCEL);   // Remove reaction
```

### Special Messages

```javascript
// Contact
await chat.sendContact(roomId, {
    name: 'John Doe',
    phone: '01012345678',
    email: 'john@example.com'
});

// KakaoTalk Profile
await chat.sendKakaoProfile(roomId, { userId: 123456789 }); 

// Location
await chat.sendLocation(roomId, {
    lat: 37.4979,
    lng: 127.0276,
    address: 'Gangnam-gu, Seoul'
});

// Schedule
await chat.sendSchedule(roomId, {
    eventAt: new Date('2025-02-15'),
    title: 'Meeting',
    location: 'Conference Room'
});

// Link
await chat.sendLink(roomId, {
    url: 'https://example.com',
    text: 'Link description'
});
```

### Editing & Deleting Messages

```javascript
// Edit a message
const sentMsg = await chat.sendText(roomId, 'Original message');
await chat.editMessage(roomId, sentMsg, 'Edited message');

// Delete a message
await chat.deleteMessage(roomId, sentMsg);
```

### Open Chat Management

```javascript
const { MemberType } = require('kakaoforge');

// Check permissions
if (client.type === MemberType.OpenChat.Owner ||
    client.type === MemberType.OpenChat.Manager) {

    // Kick a member
    await chat.openChatKick(roomId, memberId);
}
```

### Fetching Messages

```javascript
// Fetch a specific message
const message = await chat.fetchMessage(roomId, logId);

// Fetch messages from a specific user
const messages = await chat.fetchMessagesByUser(roomId, userId, {
    since: 0,
    count: 50,
    maxPages: 5,
});

// Look up a username
const username = await chat.getUsernameById(roomId, userId);
```

---

## API Reference

### Authentication

#### `createAuthByQR(options?)`

Authenticates via QR code.

```javascript
await createAuthByQR({
    onQrUrl: (url) => console.log('QR URL:', url),
    onPasscode: (code) => console.log('Passcode:', code),
    save: true,  // Save to auth.json
    authPath: './auth.json'
});
```

### Client

#### `createClient(config)`

Creates a KakaoForge client.

```javascript
const client = createClient({
    authPath: './auth.json',
    debug: true,
    autoConnect: true,
    autoReconnect: true,
    sendIntervalMs: 400,
});
```

### Event Handlers

#### `client.onReady(callback)`

Called when the connection is established.

```javascript
client.onReady((chat) => {
    console.log('Ready!');
    console.log('User ID:', client.userId);
});
```

#### `client.onMessage(callback)`

Called when a message is received.

```javascript
client.onMessage(async (chat, msg) => {
    console.log('Message:', msg.message.text);
    console.log('Sender:', msg.sender.name);
    console.log('Room:', msg.room.name);
});
```

#### `client.onJoin(callback)`

Called when a user joins.

```javascript
client.onJoin((chat, evt) => {
    console.log('Joined:', evt.member.names);
});
```

#### `client.onLeave(callback)`

Called when a user leaves.

```javascript
client.onLeave((chat, evt) => {
    console.log('Left:', evt.member.names);
});
```

#### `client.onInvite(callback)`

Called when a user is invited.

```javascript
client.onInvite((chat, evt) => {
    console.log('Invited:', evt.member.names);
    console.log('Invited by:', evt.actor.name);
});
```

#### `client.onKick(callback)`

Called when a user is kicked.

```javascript
client.onKick((chat, evt) => {
    console.log('Kicked:', evt.member.names);
});
```

#### `client.onDelete(callback)`

Called when a message is deleted.

```javascript
client.onDelete((chat, evt) => {
    console.log('Message deleted');
});
```

#### `client.onHide(callback)`

Called when a message is hidden (Open Chat).

```javascript
client.onHide((chat, evt) => {
    console.log('Message hidden');
});
```

#### `client.onPush(method, callback)`

Directly listens for a specific LOCO push event.

```javascript
client.onPush('SYNCREWR', (payload) => {
    console.log('Raw push:', payload);
});
```

### Sending Messages

#### `chat.sendText(roomId, text)`

Sends a text message.

```javascript
const sentMsg = await chat.sendText(roomId, 'Hello');
```

#### `chat.sendReply(roomId, text, msg)`

Replies to a message.

```javascript
await chat.sendReply(roomId, 'This is a reply', msg);
```

#### `chat.sendThreadReply(roomId, msgId, text, options?)`

Posts a reply in a thread.

```javascript
await chat.sendThreadReply(roomId, msgId, 'Comment');

// Also send to the chat room
await chat.sendThreadReply(roomId, msgId, 'Comment', { sendToChatRoom: true });
```

#### `chat.sendPhoto(roomId, path, options?)`

Sends a photo.

```javascript
await chat.sendPhoto(roomId, '/path/to/image.jpg', { text: 'Photo' });
```

#### `chat.sendVideo(roomId, path, options?)`

Sends a video.

```javascript
await chat.sendVideo(roomId, '/path/to/video.mp4', { text: 'Video' });
```

#### `chat.sendAudio(roomId, path)`

Sends an audio file.

```javascript
await chat.sendAudio(roomId, '/path/to/audio.mp3');
```

#### `chat.sendFile(roomId, path)`

Sends a file.

```javascript
await chat.sendFile(roomId, '/path/to/file.txt');
```

#### `chat.sendReaction(roomId, msg, reactionId)`

Sends an emoji reaction.

```javascript
await chat.sendReaction(roomId, msg, Reactions.HEART);
```

#### `chat.sendContact(roomId, contact)`

Sends a contact.

```javascript
await chat.sendContact(roomId, {
    name: 'John Doe',
    phone: '01012345678',
    email: 'john@example.com'
});
```

#### `chat.sendKakaoProfile(roomId, options)`

Sends a KakaoTalk profile.

```javascript
await chat.sendKakaoProfile(roomId, { userId: 123456789 });
```

#### `chat.sendLocation(roomId, location)`

Sends a location.

```javascript
await chat.sendLocation(roomId, {
    lat: 37.4979,
    lng: 127.0276,
    address: 'Gangnam-gu, Seoul',
    title: 'Place name'
});
```

#### `chat.sendSchedule(roomId, schedule)`

Sends a schedule event.

```javascript
await chat.sendSchedule(roomId, {
    eventAt: new Date('2025-02-15T10:00:00'),
    title: 'Meeting',
    location: 'Conference Room'
});
```

#### `chat.sendLink(roomId, link)`

Sends a link.

```javascript
await chat.sendLink(roomId, {
    url: 'https://example.com',
    text: 'Link description'
});
```

### Message Management

#### `chat.editMessage(roomId, msg, text)`

Edits a message.

```javascript
await chat.editMessage(roomId, prevMsg, 'Edited content');
```

#### `chat.deleteMessage(roomId, msg)`

Deletes a message.

```javascript
await chat.deleteMessage(roomId, msg);
```

#### `chat.fetchMessage(roomId, logId)`

Fetches a specific message.

```javascript
const message = await chat.fetchMessage(roomId, logId);
```

#### `chat.fetchMessagesByUser(roomId, userId, options)`

Fetches messages from a specific user.

```javascript
const messages = await chat.fetchMessagesByUser(roomId, userId, {
    since: 0,        // Start point
    count: 50,       // Number of messages
    maxPages: 5,     // Max pages
});
```

### Open Chat Management

#### `chat.openChatKick(roomId, memberId)`

Kicks a member from an Open Chat room.

```javascript
await chat.openChatKick(roomId, memberId);
```

### User Info

#### `chat.getUsernameById(roomId, userId)`

Looks up a username by user ID.

```javascript
const username = await chat.getUsernameById(roomId, userId);
```

---

## Configuration Options

Available options for `createClient(config)`:

```typescript
interface KakaoForgeConfig {
    // Authentication
    authPath?: string;           // Path to auth.json (default: './auth.json')
    userId?: number;             // User ID (loaded from auth.json)
    oauthToken?: string;         // OAuth token (loaded from auth.json)
    deviceUuid?: string;         // Device UUID (loaded from auth.json)
    refreshToken?: string;       // Refresh token (loaded from auth.json)

    // Connection
    autoConnect?: boolean;       // Auto-connect (default: true)
    autoReconnect?: boolean;     // Auto-reconnect (default: true)
    sendIntervalMs?: number;     // Message send interval limit (default: 400)
    reconnectMinDelayMs?: number; // Min reconnect delay
    reconnectMaxDelayMs?: number; // Max reconnect delay

    // Performance
    pingIntervalMs?: number;     // Ping interval (default: 60000)
    socketKeepAliveMs?: number;  // Socket keep-alive interval
    memberCacheTtlMs?: number;   // Member cache TTL
    memberRefreshIntervalMs?: number; // Member refresh interval
    memberLookupTimeoutMs?: number;   // Member lookup timeout

    // Video Settings
    videoQuality?: 'low' | 'high'; // Video quality
    transcodeVideos?: boolean;     // Enable video transcoding
    ffmpegPath?: string;           // FFmpeg path
    ffprobePath?: string;          // FFprobe path

    // Device Info
    deviceId?: string;           // Device ID
    os?: string;                 // OS version
    appVer?: string;             // App version
    lang?: string;               // Language (default: 'ko')

    // Misc
    debug?: boolean;             // Debug logging (default: false)
    timeZone?: string;           // Timezone
}
```

---

## Type Definitions

### MessageEvent

Structure of a message event.

```typescript
interface MessageEvent {
    message: {
        id: number | string;        // Message ID
        text: string;               // Message text
        type: number;               // Message type (MessageType)
        logId: number | string;     // Log ID
    };
    sender: {
        id: number | string;        // Sender ID
        name: string;               // Sender name
        type: number;               // Member type (Open Chat)
    };
    room: {
        id: number | string;        // Room ID
        name: string;               // Room name
        isGroupChat: boolean;       // Whether it's a group chat
        isOpenChat: boolean;        // Whether it's an Open Chat
        openLinkId?: number | string; // Open Chat link ID
    };
    attachmentsRaw: any[];          // Raw attachment data
    raw: any;                       // Raw LOCO data
}
```

### MessageType

Message types.

```javascript
const { MessageType } = require('kakaoforge');

MessageType.Text;      // 1  - Text
MessageType.Photo;     // 2  - Photo
MessageType.Video;     // 3  - Video
MessageType.Contact;   // 4  - Contact
MessageType.Audio;     // 5  - Audio
MessageType.Link;      // 9  - Link
MessageType.Schedule;  // 13 - Schedule
MessageType.Location;  // 16 - Location
MessageType.Profile;   // 17 - Profile
MessageType.File;      // 18 - File
MessageType.Reply;     // 26 - Reply
```

### MemberType

Open Chat member types.

```javascript
const { MemberType } = require('kakaoforge');

MemberType.OpenChat.Owner;   // 1 - Owner
MemberType.OpenChat.Member;  // 2 - Member
MemberType.OpenChat.Manager; // 4 - Manager
```

### Reactions

Emoji reaction types.

```javascript
const { Reactions } = require('kakaoforge');

Reactions.CANCEL;   // 0 - Remove reaction
Reactions.HEART;    // 1 - Heart
Reactions.LIKE;     // 2 - Like
Reactions.CHECK;    // 3 - Check
Reactions.LAUGH;    // 4 - Laugh
Reactions.SURPRISE; // 5 - Surprise
Reactions.SAD;      // 6 - Sad
```

---

## Examples

### Echo Bot

```javascript
const { createClient } = require('kakaoforge');

const client = createClient();

client.onReady(() => {
    console.log('Echo bot is ready!');
});

client.onMessage(async (chat, msg) => {
    if (msg.sender.id === client.userId) return;

    // Echo the received message
    await chat.sendText(msg.room.id, msg.message.text);
});
```

### Command Bot

```javascript
const { createClient, Reactions, MemberType, Mention } = require('kakaoforge');

const client = createClient({ authPath: './auth.json' });

client.onMessage(async (chat, msg) => {
    if (msg.sender.id === client.userId) return;

    const text = msg.message.text;
    if (!text) return;

    // !ping command
    if (text === '!ping') {
        await chat.sendText(msg.room.id, 'pong!');
        await chat.sendReaction(msg.room.id, msg, Reactions.CHECK);
    }

    // !info command
    if (text === '!info') {
        await chat.sendText(msg.room.id, `Room: ${msg.room.name}\nGroup Chat: ${msg.room.isGroupChat}\nOpen Chat: ${msg.room.isOpenChat}`)
    }

    // !hello
    if (text === '!hello') {
        await chat.sendText(msg.room.id, `${Mention(msg.sender.id)} Hello!`);
    }
});
```

---

## Important Notes

### Open Chat

- To use Open Chat management features (e.g., kicking), the bot must have **Owner** or **Manager** permissions.
- You can check the bot's permissions via `client.type`.

### Authentication Credentials

- After login, credentials are saved to the `auth.json` file.
- This file contains OAuth tokens — **never expose it publicly**.
- It is strongly recommended to add `auth.json` to your `.gitignore`.

### Keeping the Connection Alive

- The bot automatically sends pings to keep the connection alive.
- If disconnected, it will attempt to reconnect based on the `autoReconnect` option.

### Message Rate Limiting

- The LOCO server may reject WRITE requests with `status: -303` if messages are sent too rapidly.
- The library processes the send queue at `sendIntervalMs` intervals (default: 400ms) to handle this.

### Media

- When sending videos, enabling the `transcodeVideos` option will automatically transcode them.
- FFmpeg must be installed for transcoding to work.

---

## License

**Non-Commercial / No Abuse**

- This library is for non-commercial use only.
- Usage for spam, fraud, or any malicious purposes is prohibited.
- See the [LICENSE](LICENSE) file for details.

---

## GitHub Issues

- Having trouble or have a question about this library?
- https://github.com/aodjo/KakaoForge/issues