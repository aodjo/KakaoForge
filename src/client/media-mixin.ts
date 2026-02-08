import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as LosslessJSON from 'lossless-json';
import { Long } from 'bson';
import { BookingClient } from '../net/booking-client';
import { CarriageClient } from '../net/carriage-client';
import { uploadMultipartFile } from '../net/upload-client';
import { guessMime, readImageSize } from '../util/media';
import {
  buildUserAgent,
  buildAuthorizationHeader,
  buildAHeader,
  httpsGet,
  KATALK_HOST,
} from '../auth/login';
import {
  MessageType,
  type UploadOptions,
  type UploadResult,
  type UploadMediaType,
  type AttachmentInput,
  type AttachmentSendOptions,
  type VideoQuality,
  type LocationPayload,
  type SchedulePayload,
  type ContactPayload,
  type ProfilePayload,
  type LinkPayload,
} from '../types';
import {
  toLong,
  safeNumber,
  sha1FileHex,
  stringifyLossless,
  normalizeIdValue,
  toUnixSeconds,
  toDate,
  snapToFiveMinutes,
  formatCalendarDate,
  resolveTimeZone,
  uniqueNumbers,
  resolveFfmpegBinary,
  assertBinaryAvailable,
  probeVideo,
  toEven,
  computeTargetVideoSize,
  runProcess,
  hasTrailerProfile,
  summarizeTrailerKeys,
  buildExtra,
  normalizeMediaAttachment,
  normalizeFileAttachment,
  normalizeLocationAttachment,
  normalizeScheduleAttachment,
  normalizeContactAttachment,
  normalizeProfileAttachment,
  normalizeLinkAttachment,
  unwrapAttachment,
  ensureScheduleAttachment,
  escapeVCardValue,
  buildVCard,
  streamEncryptedFile,
  parseAttachments,
  waitForPushMethod,
  extractProfileFromResponse,
  assertCalendarOk,
  extractEventId,
  extractShareMessageData,
  normalizeScheduleShareData,
  previewCalendarBody,
} from '../utils';

import type { KakaoForgeClient } from './client';

/**
 * Media mixin interface - declares methods added to KakaoForgeClient
 */
export interface MediaMixin {
  _ensureVideoConf(): Promise<any>;
  _getVideoProfile(quality: VideoQuality): Promise<{ bitrate: number; resolution: number }>;
  _transcodeVideo(filePath: string, opts?: UploadOptions): Promise<any>;
  _uploadContactVCard(contact: ContactPayload, opts?: AttachmentSendOptions, chatId?: number | string): Promise<any>;
  _profileHeaders(extra?: Record<string, string>): Record<string, string>;
  _fetchProfileAttachment(userId: number | string): Promise<any>;
  _uploadMedia(type: string, filePath: string, opts?: UploadOptions, chatId?: number | string): Promise<any>;
  _sendWithAttachment(chatId: number | string, msgType: number, text: string, attachment: any, opts: any, mediaType?: string): Promise<any>;
  _prepareMediaAttachment(type: string, attachment: AttachmentInput, opts?: UploadOptions, chatId?: number | string): Promise<any>;
  uploadPhoto(filePath: string, opts?: UploadOptions): Promise<UploadResult>;
  uploadVideo(filePath: string, opts?: UploadOptions): Promise<UploadResult>;
  uploadAudio(filePath: string, opts?: UploadOptions): Promise<UploadResult>;
  uploadFile(filePath: string, opts?: UploadOptions): Promise<UploadResult>;
  sendPhoto(chatId: number | string, attachment: AttachmentInput, opts?: AttachmentSendOptions): Promise<any>;
  sendPhotoAtThread(chatId: number | string, threadId: number | string, attachment: AttachmentInput, opts?: AttachmentSendOptions): Promise<any>;
  sendVideo(chatId: number | string, attachment: AttachmentInput, opts?: AttachmentSendOptions): Promise<any>;
  sendVideoAtThread(chatId: number | string, threadId: number | string, attachment: AttachmentInput, opts?: AttachmentSendOptions): Promise<any>;
  sendAudio(chatId: number | string, attachment: AttachmentInput, opts?: AttachmentSendOptions): Promise<any>;
  sendAudioAtThread(chatId: number | string, threadId: number | string, attachment: AttachmentInput, opts?: AttachmentSendOptions): Promise<any>;
  sendFile(chatId: number | string, attachment: AttachmentInput, opts?: AttachmentSendOptions): Promise<any>;
  sendFileAtThread(chatId: number | string, threadId: number | string, attachment: AttachmentInput, opts?: AttachmentSendOptions): Promise<any>;
  sendContact(chatId: number | string, contact: ContactPayload | AttachmentInput, opts?: AttachmentSendOptions): Promise<any>;
  sendKakaoProfile(chatId: number | string, profile: ProfilePayload | AttachmentInput, opts?: AttachmentSendOptions): Promise<any>;
  sendLocation(chatId: number | string, location: LocationPayload | AttachmentInput, opts?: AttachmentSendOptions): Promise<any>;
  sendSchedule(chatId: number | string, schedule: SchedulePayload | AttachmentInput, opts?: AttachmentSendOptions): Promise<any>;
  sendLink(chatId: number | string, link: string | LinkPayload | AttachmentInput, opts?: AttachmentSendOptions): Promise<any>;
}

async function _ensureVideoConf(this: KakaoForgeClient) {
    if (this._conf && hasTrailerProfile(this._conf)) {
      return this._conf;
    }
    const booking = new BookingClient();
    try {
      await booking.connect();
      const conf = await booking.getConf({
        userId: this.userId,
        os: this.os,
        mccmnc: this.mccmnc,
        appVer: this.appVer,
      });
      this._conf = conf;
      if (this.debugGetConf || this.debug) {
        const summary = summarizeTrailerKeys(conf?.raw);
        if (summary) {
          console.log('[DBG] GETCONF trailer keys:', JSON.stringify(summary));
        } else {
          console.log('[DBG] GETCONF trailer keys: none');
        }
        console.log('[DBG] GETCONF trailerInfo:', JSON.stringify({
          trailerInfo: conf?.trailerInfo || {},
          trailerHighInfo: conf?.trailerHighInfo || {},
        }));
      }
      return conf;
    } finally {
      booking.disconnect();
    }
  }

async function _getVideoProfile(this: KakaoForgeClient, quality: VideoQuality) {
    const conf = await this._ensureVideoConf();
    const trailerInfo = conf?.trailerInfo || {};
    const trailerHighInfo = conf?.trailerHighInfo || {};
    const highBitrate = Number(trailerHighInfo?.videoTranscodingBitrate || 0);
    const highResolution = Number(trailerHighInfo?.videoTranscodingResolution || 0);
    const base = quality === 'high' && highBitrate > 0 && highResolution > 0
      ? trailerHighInfo
      : trailerInfo;
    const bitrate = Number(base?.videoTranscodingBitrate || 0);
    const resolution = Number(base?.videoTranscodingResolution || 0);
    if (!bitrate || !resolution) {
      throw new Error('GETCONF missing trailerInfo. Cannot determine video transcode profile.');
    }
    return { bitrate, resolution };
  }

async function _transcodeVideo(this: KakaoForgeClient, filePath: string, opts: UploadOptions = {}) {
    const ffmpegPath = resolveFfmpegBinary('ffmpeg', {
      ffmpegPath: opts.ffmpegPath || this.ffmpegPath,
      ffprobePath: opts.ffprobePath || this.ffprobePath,
    });
    const ffprobePath = resolveFfmpegBinary('ffprobe', {
      ffmpegPath: opts.ffmpegPath || this.ffmpegPath,
      ffprobePath: opts.ffprobePath || this.ffprobePath,
    });
    assertBinaryAvailable(ffmpegPath, 'ffmpeg');
    assertBinaryAvailable(ffprobePath, 'ffprobe');

    const meta = probeVideo(filePath, ffprobePath);
    if (!meta.width || !meta.height) {
      throw new Error('ffprobe failed: no video stream');
    }

    const quality: VideoQuality = opts.videoQuality || this.videoQuality || 'high';
    const profile = await this._getVideoProfile(quality);
    const resolution = Number(opts.videoResolution) > 0 ? Number(opts.videoResolution) : profile.resolution;
    const targetSize = computeTargetVideoSize(meta, resolution);

    const targetBitrate = Number(opts.videoBitrate) > 0
      ? Number(opts.videoBitrate)
      : profile.bitrate;
    const sourceBitrate = meta.bitrate > 0 ? meta.bitrate : 0;
    const finalBitrate = sourceBitrate > 0 ? Math.min(sourceBitrate, targetBitrate) : targetBitrate;
    const bitrateK = Math.max(128, Math.round(finalBitrate / 1000));

    const tempDir = opts.tempDir || os.tmpdir();
    const outputPath = path.join(
      tempDir,
      `kakaoforge-video-${Date.now()}-${Math.random().toString(16).slice(2)}.mp4`
    );

    const codec = quality === 'high' ? 'libx265' : 'libx264';
    const args = [
      '-y',
      '-i', filePath,
      '-map', '0:v:0',
      '-map', '0:a?',
      '-c:v', codec,
      '-pix_fmt', 'yuv420p',
      '-vf', `scale=${targetSize.width}:${targetSize.height}:flags=lanczos,setsar=1`,
      '-r', '30',
      '-b:v', `${bitrateK}k`,
      '-maxrate', `${bitrateK}k`,
      '-bufsize', `${bitrateK * 2}k`,
      '-preset', 'medium',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-ar', '44100',
      '-ac', '2',
      '-movflags', '+faststart',
      outputPath,
    ];

    await runProcess(ffmpegPath, args, opts.timeoutMs || 0);

    const cleanup = () => {
      if (opts.keepTemp) return;
      try {
        fs.unlinkSync(outputPath);
      } catch {
        // ignore
      }
    };

    return {
      path: outputPath,
      width: targetSize.width,
      height: targetSize.height,
      duration: meta.duration > 0 ? Math.round(meta.duration * 1000) : undefined,
      cleanup,
    };
  }

async function _uploadContactVCard(this: KakaoForgeClient, 
    contact: ContactPayload,
    opts: AttachmentSendOptions = {},
    chatId?: number | string
  ) {
    if (!contact || !contact.name) {
      throw new Error("Contact 'name' is required to upload vCard.");
    }

    let filePath = contact.filePath || '';
    let cleanupTemp: (() => void) | null = null;
    if (!filePath) {
      const vcard = contact.vcard || buildVCard(contact);
      const tempDir = os.tmpdir();
      const safeName = contact.name.replace(/[\\/:*?"<>|]+/g, '_');
      filePath = path.join(tempDir, `kakaoforge-contact-${Date.now()}-${safeName || 'contact'}.vcf`);
      fs.writeFileSync(filePath, vcard, 'utf-8');
      cleanupTemp = () => {
        if ((opts as any).keepTemp) return;
        try {
          fs.unlinkSync(filePath);
        } catch {
          // ignore
        }
      };
    }

    let stat: fs.Stats;
    try {
      stat = fs.statSync(filePath);
    } catch {
      throw new Error(`file not found: ${filePath}`);
    }
    if (!stat.isFile()) {
      throw new Error(`not a file: ${filePath}`);
    }

    try {
      const res = await uploadMultipartFile({
        url: 'https://up-m.talk.kakao.com/upload',
        filePath,
        fieldName: 'attachment',
        filename: path.basename(filePath),
        mime: 'text/x-vcard',
        fields: {
          user_id: 0,
          attachment_type: 'text/x-vcard',
        },
        headers: {
          'Accept': '*/*',
          'Accept-Language': this.lang || 'ko',
          'User-Agent': buildUserAgent(this.appVer),
        },
        timeoutMs: opts.timeoutMs || 15000,
      });

      const bodyText = (res.body || '').trim();
      let rawPath = '';
      if (res.json && typeof res.json === 'object') {
        rawPath = String((res.json as any).path || (res.json as any).url || '');
      } else if (typeof res.json === 'string') {
        rawPath = res.json;
      } else {
        rawPath = bodyText;
      }
      rawPath = rawPath.trim();
      if (rawPath.startsWith('"') && rawPath.endsWith('"') && rawPath.length >= 2) {
        rawPath = rawPath.slice(1, -1);
      }
      if (!rawPath) {
        throw new Error(`contact upload failed: empty response`);
      }
      const key = rawPath.startsWith('/') ? rawPath.slice(1) : rawPath;
      return {
        name: contact.name,
        k: key,
        s: stat.size,
      };
    } finally {
      if (cleanupTemp) cleanupTemp();
    }
  }

function _profileHeaders(this: KakaoForgeClient, extra: Record<string, string> = {}) {
    return {
      'Authorization': buildAuthorizationHeader(this.oauthToken, this.deviceId || this.deviceUuid),
      'A': buildAHeader(this.appVer, this.lang),
      'User-Agent': buildUserAgent(this.appVer),
      'talk-agent': `${this.os}/${this.appVer}`,
      'talk-language': this.lang,
      ...extra,
    };
  }

async function _fetchProfileAttachment(this: KakaoForgeClient, userId: number | string) {
    if (!this.oauthToken || !this.deviceUuid) {
      throw new Error('Profile lookup requires oauthToken/deviceUuid');
    }
    const idStr = String(userId);
    const candidates: string[] = [];
    if (Number(userId) === this.userId) {
      candidates.push('/android/profile3/me.json');
    }
    candidates.push(`/android/profile3/friend_info.json?id=${encodeURIComponent(idStr)}`);

    let lastError: Error | null = null;
    for (const apiPath of candidates) {
      try {
        const res = await httpsGet(KATALK_HOST, apiPath, this._profileHeaders());
        if (res?.status && res.status >= 400) {
          lastError = new Error(`Profile lookup failed: status=${res.status}`);
          continue;
        }
        const body = res?.body;
        if (body && typeof body === 'object') {
          const status = (body as any).status;
          if (typeof status === 'number' && status !== 0) {
            lastError = new Error(`Profile lookup failed: ${JSON.stringify(body)}`);
            continue;
          }
        }
        const extracted = extractProfileFromResponse(body, userId);
        return extracted;
      } catch (err) {
        lastError = err as Error;
      }
    }
    if (lastError) throw lastError;
    throw new Error('Failed to fetch profile info');
  }

async function _uploadMedia(this: KakaoForgeClient, 
    type: UploadMediaType,
    filePath: string,
    opts: UploadOptions = {},
    chatId?: number | string
  ): Promise<UploadResult> {
    if (!filePath) {
      throw new Error('filePath is required');
    }

    let cleanupTemp: (() => void) | null = null;
    if (type === 'video' && (opts.transcode ?? this.transcodeVideos)) {
      const transcode = await this._transcodeVideo(filePath, opts);
      filePath = transcode.path;
      cleanupTemp = transcode.cleanup;
      opts = {
        ...opts,
        mime: opts.mime || 'video/mp4',
        width: transcode.width ?? opts.width,
        height: transcode.height ?? opts.height,
        duration: transcode.duration ?? opts.duration,
      };
    }

    let result: UploadResult;
    try {
      let stat: fs.Stats;
      try {
        stat = fs.statSync(filePath);
      } catch (err) {
        throw new Error(`file not found: ${filePath}`);
      }
      if (!stat.isFile()) {
        throw new Error(`not a file: ${filePath}`);
      }

    const uploadChatId = chatId ?? opts.chatId;
    if (!uploadChatId) {
      throw new Error('chatId is required for LOCO upload. Use sendPhoto(chatId, path) or pass { chatId }.');
    }

    const msgId = opts.msgId !== undefined && opts.msgId !== null ? opts.msgId : this._nextClientMsgId();

    if (!this._carriage && !this._locoAutoConnectAttempted) {
      this._locoAutoConnectAttempted = true;
      try {
        await this.connect();
      } catch (err) {
        if (this.debug) {
          console.error('[DBG] LOCO auto-connect failed:', err.message);
        }
      }
    }

    if (!this._carriage) {
      throw new Error('LOCO not connected. Call client.connect() first.');
    }

    const logType = type === 'photo'
      ? MessageType.Photo
      : type === 'video'
        ? MessageType.Video
        : type === 'audio'
          ? MessageType.Audio
          : MessageType.File;

    const fallbackMime = type === 'photo'
      ? 'image/jpeg'
      : type === 'video'
        ? 'video/mp4'
        : type === 'audio'
          ? 'audio/mpeg'
          : 'application/octet-stream';
    const mime = opts.mime || guessMime(filePath, fallbackMime);

    let width = opts.width;
    let height = opts.height;
    if (type === 'photo' && (!width || !height)) {
      const size = readImageSize(filePath);
      if (size) {
        width = width || size.width;
        height = height || size.height;
      }
    }

    const checksum = (await sha1FileHex(filePath)).toLowerCase();
    const extRaw = path.extname(filePath);
    const ext = extRaw ? extRaw.replace('.', '').toLowerCase() : '';

    const shipBody: any = {
      c: toLong(uploadChatId),
      s: toLong(stat.size),
      t: logType,
      cs: checksum,
    };
    if (ext) shipBody.e = ext;
    if (opts.extra) shipBody.ex = opts.extra;

    const shipRes = await this._carriage.request('SHIP', shipBody, opts.timeoutMs || 10000);
    if (typeof shipRes.status === 'number' && shipRes.status !== 0) {
      throw new Error(`SHIP failed: status=${shipRes.status}`);
    }
    const shipBodyRes = shipRes?.body || {};
    const token = shipBodyRes.k || shipBodyRes.key || shipBodyRes.token;
    if (!token) {
      const preview = shipBodyRes ? JSON.stringify(shipBodyRes).slice(0, 400) : '(empty)';
      throw new Error(`SHIP response missing token: ${preview}`);
    }

    let host = shipBodyRes.vh || shipBodyRes.host || '';
    let port = Number(shipBodyRes.p || shipBodyRes.port || 0);
    if (!host || !port) {
      const trailerRes = await this._carriage.request('GETTRAILER', { k: token, t: logType }, opts.timeoutMs || 10000);
      if (typeof trailerRes.status === 'number' && trailerRes.status !== 0) {
        throw new Error(`GETTRAILER failed: status=${trailerRes.status}`);
      }
      const trailerBody = trailerRes?.body || {};
      host = host || trailerBody.vh || trailerBody.host || '';
      port = port || Number(trailerBody.p || trailerBody.port || 0);
    }

    if (!host || !port) {
      throw new Error('UPLOAD failed: no trailer host/port');
    }

    const uploadClient = new CarriageClient();
    uploadClient.on('error', (err) => {
      if (this.debug) {
        console.error('[DBG] Upload error:', err.message);
      }
    });
    let postRes: any = null;
    let completePacket: any = null;
    let completeWait: { promise: Promise<any>; cancel: () => void } | null = null;
    try {
      await uploadClient.connect(host, port, opts.timeoutMs || 10000, this.socketKeepAliveMs || 30000);
      const threadId = opts.threadId;
      let scope = opts.scope;
      if (scope === undefined && threadId) {
        scope = opts.sendToChatRoom === true ? 3 : 2;
      }
      const deviceType = Number(this.dtype);
      const silenceValue = opts.isSilence ?? opts.silence;
      const postBody: any = {
        k: token,
        s: toLong(stat.size),
        f: opts.filename || opts.name || path.basename(filePath),
        t: logType,
        c: toLong(uploadChatId),
        mid: toLong(1),
        ns: opts.noSeen ?? true,
        u: toLong(this.userId),
        os: this.os,
        av: this.appVer,
        nt: this.ntype,
        mm: this.mccmnc,
      };
      if (Number.isFinite(deviceType)) {
        postBody.dt = deviceType;
      }
      if (width) postBody.w = Math.floor(width);
      if (height) postBody.h = Math.floor(height);
      if (scope !== undefined) postBody.scp = scope;
      if (threadId) postBody.tid = toLong(threadId);
      if (opts.supplement) postBody.sp = String(opts.supplement);
      if (opts.featureStat) postBody.featureStat = String(opts.featureStat);
      if (typeof silenceValue === 'boolean') postBody.silence = silenceValue;
      const extraValue = typeof opts.extra === 'string' ? opts.extra : '';
      const captionValue =
        typeof (opts as any).text === 'string' && (opts as any).text.trim().length > 0
          ? String((opts as any).text)
          : '';
      if (extraValue) {
        postBody.ex = extraValue;
      } else if (captionValue) {
        postBody.ex = JSON.stringify({ cmt: captionValue });
      }

      completeWait = waitForPushMethod(uploadClient, 'COMPLETE', opts.timeoutMs || 20000);
      postRes = await uploadClient.request('POST', postBody, opts.timeoutMs || 10000);
      if (typeof postRes.status === 'number' && postRes.status !== 0) {
        throw new Error(`UPLOAD POST failed: status=${postRes.status}`);
      }
      const offset = safeNumber(postRes?.body?.o, 0);
      if (offset < stat.size) {
        await streamEncryptedFile(uploadClient, filePath, offset, stat.size, opts.onProgress);
      }
      completePacket = await completeWait.promise;
      const completeBody = completePacket?.body || {};
      if (typeof completeBody.status === 'number' && completeBody.status !== 0) {
        throw new Error(`UPLOAD COMPLETE failed: status=${completeBody.status}`);
      }
      await uploadClient.end();
    } finally {
      if (completeWait) completeWait.cancel();
      uploadClient.disconnect();
    }

    const postBodyRes = postRes?.body && typeof postRes.body === 'object' ? postRes.body : {};
    const shipKey = shipBodyRes?.k || shipBodyRes?.key || shipBodyRes?.token || token;
    const completeBody = completePacket?.body || {};
    const completeChatLog = completeBody.chatLog || completeBody.chatlog || null;
    const completeAttachment = completeChatLog
      ? parseAttachments(completeChatLog.attachment ?? completeChatLog.attachments ?? completeChatLog.extra ?? null)[0]
      : null;
    let attachment: Record<string, any> = {};
    if (type === 'video') {
      const tk = postBodyRes.tk || postBodyRes.token || '';
      if (tk) {
        attachment.tk = tk;
        attachment.k = shipKey;
        if (postBodyRes.tkh) attachment.tkh = postBodyRes.tkh;
        if (postBodyRes.urlh) attachment.urlh = postBodyRes.urlh;
      } else if (completeAttachment) {
        attachment = normalizeMediaAttachment(completeAttachment) || {};
        if (!attachment.k && shipKey) attachment.k = shipKey;
      } else {
        const preview = postBodyRes ? JSON.stringify(postBodyRes).slice(0, 400) : '(empty)';
        throw new Error(`UPLOAD POST missing video token: ${preview}`);
      }
    } else {
      attachment.k = shipKey;
    }

    attachment.cs = postBodyRes.cs || checksum;
    if (type === 'file') {
      attachment.s = postBodyRes.s ?? stat.size;
      attachment.name = postBodyRes.name || opts.name || opts.filename || path.basename(filePath);
      attachment.size = postBodyRes.size ?? stat.size;
      const mimeValue = postBodyRes.mt || postBodyRes.mime || mime;
      if (mimeValue) {
        attachment.mime = mimeValue;
      }
    } else {
      attachment.s = postBodyRes.s ?? stat.size;
      const mimeValue = postBodyRes.mt || mime;
      if (mimeValue) {
        attachment.mt = mimeValue;
      }
      const widthValue = postBodyRes.w ?? width;
      const heightValue = postBodyRes.h ?? height;
      if (widthValue) attachment.w = widthValue;
      if (heightValue) attachment.h = heightValue;
      if (postBodyRes.d ?? opts.duration) attachment.d = postBodyRes.d ?? opts.duration;
    }

    result = {
      accessKey: String(token),
      attachment,
      msgId,
        info: { ship: shipBodyRes, post: postRes?.body, complete: completeBody },
        raw: { ship: shipRes, post: postRes, complete: completePacket },
        chatLog: completeBody.chatLog,
        complete: completeBody,
      };
    } finally {
      if (cleanupTemp) cleanupTemp();
    }

    return result;
  }

async function uploadPhoto(this: KakaoForgeClient, filePath: string, opts: UploadOptions = {}) {
    return this._uploadMedia('photo', filePath, opts);
  }

async function uploadVideo(this: KakaoForgeClient, filePath: string, opts: UploadOptions = {}) {
    return this._uploadMedia('video', filePath, opts);
  }

async function uploadAudio(this: KakaoForgeClient, filePath: string, opts: UploadOptions = {}) {
    return this._uploadMedia('audio', filePath, opts);
  }

async function uploadFile(this: KakaoForgeClient, filePath: string, opts: UploadOptions = {}) {
    return this._uploadMedia('file', filePath, opts);
  }

async function _sendWithAttachment(this: KakaoForgeClient, 
    chatId: number | string,
    type: number,
    text: string,
    attachment: AttachmentInput,
    opts: AttachmentSendOptions = {},
    label = 'attachment'
  ) {
    const extra = buildExtra(unwrapAttachment(attachment), opts.extra);
    if (!extra) {
      throw new Error(`${label} attachment is required. Upload first and pass attachment info.`);
    }
    const { text: _text, ...sendOpts } = opts;
    return this.sendMessage(chatId, text || '', { ...sendOpts, type, extra });
  }

async function _prepareMediaAttachment(this: KakaoForgeClient, 
    type: UploadMediaType,
    attachment: AttachmentInput,
    opts: AttachmentSendOptions = {},
    chatId?: number | string
  ) {
    if (typeof attachment === 'string') {
      let stat: fs.Stats;
      try {
        stat = fs.statSync(attachment);
      } catch {
        throw new Error(`file not found: ${attachment}`);
      }
      if (!stat.isFile()) {
        throw new Error(`not a file: ${attachment}`);
      }
      return await this._uploadMedia(type, attachment, opts, chatId);
    }
    return attachment;
  }




async function sendPhoto(this: KakaoForgeClient, chatId: number | string, attachment: AttachmentInput, opts: AttachmentSendOptions = {}) {
    const attachmentMsgId = typeof attachment === 'object' && attachment && 'msgId' in attachment
      ? (attachment as any).msgId
      : undefined;
    const msgId = opts.msgId !== undefined && opts.msgId !== null
      ? opts.msgId
      : (attachmentMsgId !== undefined ? attachmentMsgId : this._nextClientMsgId());
    const sendOpts = { ...opts, msgId };
    if (typeof attachment === 'string') {
      return this._uploadMedia('photo', attachment, sendOpts, chatId);
    }
    const prepared = await this._prepareMediaAttachment('photo', attachment, sendOpts, chatId);
    const normalized = normalizeMediaAttachment(unwrapAttachment(prepared));
    return this._sendWithAttachment(chatId, MessageType.Photo, opts.text || '', normalized, sendOpts, 'photo');
  }

async function sendPhotoAtThread(this: KakaoForgeClient, 
    chatId: number | string,
    threadId: number | string,
    attachment: AttachmentInput,
    opts: AttachmentSendOptions = {}
  ) {
    const scope = typeof opts.scope === 'number'
      ? opts.scope
      : (opts.sendToChatRoom === true ? 3 : 2);
    return this.sendPhoto(chatId, attachment, { ...opts, threadId, scope });
  }

async function sendVideo(this: KakaoForgeClient, chatId: number | string, attachment: AttachmentInput, opts: AttachmentSendOptions = {}) {
    const attachmentMsgId = typeof attachment === 'object' && attachment && 'msgId' in attachment
      ? (attachment as any).msgId
      : undefined;
    const msgId = opts.msgId !== undefined && opts.msgId !== null
      ? opts.msgId
      : (attachmentMsgId !== undefined ? attachmentMsgId : this._nextClientMsgId());
    const sendOpts = { ...opts, msgId };
    if (typeof attachment === 'string') {
      return this._uploadMedia('video', attachment, sendOpts, chatId);
    }
    const prepared = await this._prepareMediaAttachment('video', attachment, sendOpts, chatId);
    const normalized = normalizeMediaAttachment(unwrapAttachment(prepared));
    return this._sendWithAttachment(chatId, MessageType.Video, opts.text || '', normalized, sendOpts, 'video');
  }

async function sendVideoAtThread(this: KakaoForgeClient, 
    chatId: number | string,
    threadId: number | string,
    attachment: AttachmentInput,
    opts: AttachmentSendOptions = {}
  ) {
    const scope = typeof opts.scope === 'number'
      ? opts.scope
      : (opts.sendToChatRoom === true ? 3 : 2);
    return this.sendVideo(chatId, attachment, { ...opts, threadId, scope });
  }

async function sendAudio(this: KakaoForgeClient, chatId: number | string, attachment: AttachmentInput, opts: AttachmentSendOptions = {}) {
    const attachmentMsgId = typeof attachment === 'object' && attachment && 'msgId' in attachment
      ? (attachment as any).msgId
      : undefined;
    const msgId = opts.msgId !== undefined && opts.msgId !== null
      ? opts.msgId
      : (attachmentMsgId !== undefined ? attachmentMsgId : this._nextClientMsgId());
    const sendOpts = { ...opts, msgId };
    if (typeof attachment === 'string') {
      return this._uploadMedia('audio', attachment, sendOpts, chatId);
    }
    const prepared = await this._prepareMediaAttachment('audio', attachment, sendOpts, chatId);
    const normalized = normalizeMediaAttachment(unwrapAttachment(prepared));
    return this._sendWithAttachment(chatId, MessageType.Audio, opts.text || '', normalized, sendOpts, 'audio');
  }

async function sendAudioAtThread(this: KakaoForgeClient, 
    chatId: number | string,
    threadId: number | string,
    attachment: AttachmentInput,
    opts: AttachmentSendOptions = {}
  ) {
    const scope = typeof opts.scope === 'number'
      ? opts.scope
      : (opts.sendToChatRoom === true ? 3 : 2);
    return this.sendAudio(chatId, attachment, { ...opts, threadId, scope });
  }

async function sendFile(this: KakaoForgeClient, chatId: number | string, attachment: AttachmentInput, opts: AttachmentSendOptions = {}) {
    const attachmentMsgId = typeof attachment === 'object' && attachment && 'msgId' in attachment
      ? (attachment as any).msgId
      : undefined;
    const msgId = opts.msgId !== undefined && opts.msgId !== null
      ? opts.msgId
      : (attachmentMsgId !== undefined ? attachmentMsgId : this._nextClientMsgId());
    const sendOpts = { ...opts, msgId };
    if (typeof attachment === 'string') {
      return this._uploadMedia('file', attachment, sendOpts, chatId);
    }
    const prepared = await this._prepareMediaAttachment('file', attachment, sendOpts, chatId);
    const normalized = normalizeFileAttachment(unwrapAttachment(prepared));
    return this._sendWithAttachment(chatId, MessageType.File, opts.text || '', normalized, sendOpts, 'file');
  }

async function sendFileAtThread(this: KakaoForgeClient, 
    chatId: number | string,
    threadId: number | string,
    attachment: AttachmentInput,
    opts: AttachmentSendOptions = {}
  ) {
    const scope = typeof opts.scope === 'number'
      ? opts.scope
      : (opts.sendToChatRoom === true ? 3 : 2);
    return this.sendFile(chatId, attachment, { ...opts, threadId, scope });
  }

async function sendContact(this: KakaoForgeClient, chatId: number | string, contact: ContactPayload | AttachmentInput, opts: AttachmentSendOptions = {}) {
    const unwrapped = unwrapAttachment(contact);
    const normalized = normalizeContactAttachment(unwrapped);
    const fallbackText = typeof contact === 'string'
      ? contact
      : (contact && typeof contact === 'object' ? (contact as ContactPayload).name || '' : '');
    if (normalized && typeof normalized === 'object' && !Array.isArray(normalized)) {
      const contactUrl = (normalized as any).url || (normalized as any).path;
      if (contactUrl) {
        const attachment = normalizeContactAttachment({ ...(normalized as any), url: contactUrl });
        return this._sendWithAttachment(
          chatId,
          MessageType.Contact,
          opts.text || fallbackText || '',
          attachment,
          opts,
          'contact'
        );
      }
    }

    const payload: ContactPayload = typeof contact === 'string'
      ? { name: contact }
      : (contact as ContactPayload);
    const uploaded = await this._uploadContactVCard(payload, opts, chatId);
    const uploadedAttachment = normalizeContactAttachment({
      ...unwrapAttachment(uploaded),
      name: payload.name,
    });
    return this._sendWithAttachment(
      chatId,
      MessageType.Contact,
      opts.text || fallbackText || '',
      uploadedAttachment,
      opts,
      'contact'
    );
  }

async function sendKakaoProfile(this: KakaoForgeClient, chatId: number | string, profile: ProfilePayload | AttachmentInput, opts: AttachmentSendOptions = {}) {
    const unwrapped = unwrapAttachment(profile);
    const normalized = normalizeProfileAttachment(unwrapped);
    if (!normalized || typeof normalized !== 'object' || Array.isArray(normalized)) {
      throw new Error('sendKakaoProfile requires profile info');
    }
    const userId = (normalized as any).userId ?? (normalized as any).id;
    if (!userId) {
      throw new Error('sendKakaoProfile requires userId');
    }

    const hasAccessPermit = !!(normalized as any).accessPermit;
    const missingProfileFields = !(normalized as any).nickName
      || !(normalized as any).profileImageUrl
      || !(normalized as any).fullProfileImageUrl
      || !(normalized as any).statusMessage;
    let fetched: any = null;
    if ((!hasAccessPermit || missingProfileFields) && this.oauthToken && this.deviceUuid) {
      fetched = await this._fetchProfileAttachment(userId);
    }

    const attachment: any = {
      userId: Number(userId),
      nickName: (normalized as any).nickName || (normalized as any).nickname || fetched?.nickName || '',
      fullProfileImageUrl: (normalized as any).fullProfileImageUrl || fetched?.fullProfileImageUrl || '',
      profileImageUrl: (normalized as any).profileImageUrl || fetched?.profileImageUrl || '',
      statusMessage: (normalized as any).statusMessage || fetched?.statusMessage || '',
      accessPermit: String((normalized as any).accessPermit || fetched?.accessPermit || ''),
    };
    if (!attachment.accessPermit) {
      throw new Error('sendKakaoProfile requires accessPermit');
    }
    const fallbackText = attachment.nickName || '';
    return this._sendWithAttachment(
      chatId,
      MessageType.Profile,
      opts.text || fallbackText || '',
      attachment,
      opts,
      'profile'
    );
  }

async function sendLocation(this: KakaoForgeClient, chatId: number | string, location: LocationPayload | AttachmentInput, opts: AttachmentSendOptions = {}) {
    const normalized = normalizeLocationAttachment(location);
    const fallbackText = location && typeof location === 'object'
      ? ((location as LocationPayload).title || (location as LocationPayload).address || '')
      : '';
    return this._sendWithAttachment(
      chatId,
      MessageType.Location,
      opts.text || fallbackText || '',
      normalized,
      opts,
      'location'
    );
  }

async function sendSchedule(this: KakaoForgeClient, chatId: number | string, schedule: SchedulePayload | AttachmentInput, opts: AttachmentSendOptions = {}) {
    const normalized = normalizeScheduleAttachment(schedule);
    const fallbackText = schedule && typeof schedule === 'object'
      ? ((schedule as SchedulePayload).title || '')
      : '';

    if (typeof normalized === 'string') {
      return this._sendWithAttachment(
        chatId,
        MessageType.Schedule,
        opts.text || fallbackText || '',
        normalized,
        opts,
        'schedule'
      );
    }

    if (normalized && typeof normalized === 'object' && !Array.isArray(normalized)) {
      const hasId = normalized.postId || normalized.scheduleId;
      if (hasId) {
        return this._sendWithAttachment(
          chatId,
          MessageType.Schedule,
          opts.text || fallbackText || '',
          normalized,
          opts,
          'schedule'
        );
      }
    }

    if (!schedule || typeof schedule !== 'object') {
      throw new Error('Schedule sending requires a schedule object.');
    }

    const payload = schedule as SchedulePayload;
    if (payload.eventAt === undefined || payload.eventAt === null) {
      throw new Error("Schedule sending requires 'eventAt'.");
    }
    if (!payload.title) {
      throw new Error("Schedule sending requires 'title'.");
    }

    let eventAtDate = toDate(payload.eventAt);
    if (!eventAtDate) {
      throw new Error("Schedule sending: invalid 'eventAt' format.");
    }
    eventAtDate = snapToFiveMinutes(eventAtDate, 'ceil');
    let endAtDate = payload.endAt ? toDate(payload.endAt) : new Date(eventAtDate.getTime() + 60 * 60 * 1000);
    if (!endAtDate) {
      throw new Error("Schedule sending: invalid 'endAt' format.");
    }
    endAtDate = snapToFiveMinutes(endAtDate, 'ceil');
    if (endAtDate.getTime() <= eventAtDate.getTime()) {
      endAtDate = snapToFiveMinutes(new Date(eventAtDate.getTime() + 60 * 60 * 1000), 'ceil');
    }

    const chatIdNum = safeNumber(chatId, 0);
    if (!chatIdNum) {
      throw new Error('sendSchedule requires chatId');
    }

    const calendar = this._getCalendarClient();
    const eventAtStr = formatCalendarDate(eventAtDate);
    const endAtStr = formatCalendarDate(endAtDate);
    let members = uniqueNumbers(payload.members);
    if (members.length === 0) {
      members = uniqueNumbers(await this._resolveChatMembers(chatIdNum));
    }
    if (this.userId) {
      members = uniqueNumbers([...members, this.userId]);
    }
    const timeZone = payload.timeZone || this.timeZone || resolveTimeZone();
    const referer = payload.referer || 'detail';

    const addEvent: any = {
      startAt: eventAtStr,
      endAt: endAtStr,
      subject: payload.title,
      members,
      allDay: !!payload.allDay,
      chatId: chatIdNum,
      timeZone,
      attendOn: true,
    };

    if (payload.location) {
      addEvent.location = typeof payload.location === 'string'
        ? { name: payload.location }
        : payload.location;
    }

    const alarmAtDate = payload.alarmAt ? toDate(payload.alarmAt) : null;
    const eventAtSec = Math.floor(eventAtDate.getTime() / 1000);
    const alarmAtSec = alarmAtDate ? Math.floor(alarmAtDate.getTime() / 1000) : undefined;
    if (alarmAtSec !== undefined && alarmAtSec <= eventAtSec) {
      const diffMin = Math.max(0, Math.round((eventAtSec - alarmAtSec) / 60));
      addEvent.alarmMin = [diffMin];
    }

    let refreshed = false;
    const runCalendar = async (fn: () => Promise<any>) => {
      let res = await fn();
      if (res?.status === 401 && !refreshed) {
        refreshed = true;
        await this.refreshAuth();
        if (this._calendar) {
          this._calendar.oauthToken = this.oauthToken;
        }
        res = await fn();
      }
      return res;
    };

    const createRes = await runCalendar(() => calendar.createEvent(addEvent, { referer }));
    assertCalendarOk(createRes, '?쇱젙 ?앹꽦');
    const eId = extractEventId(createRes?.body);
    if (!eId) {
      throw new Error('?쇱젙 ?앹꽦 ?ㅽ뙣: eId ?놁쓬');
    }

    const connectRes = await runCalendar(() => calendar.connectEvent(eId, chatIdNum, referer));
    assertCalendarOk(connectRes, '?쇱젙 ?곌껐');

    const shareRes = await runCalendar(() => calendar.shareMessage(eId, referer));
    assertCalendarOk(shareRes, '?쇱젙 怨듭쑀');
    let attachment = extractShareMessageData(shareRes?.body);
    attachment = normalizeScheduleShareData(attachment);
    if (this.debug) {
      const sharePreview = previewCalendarBody(shareRes?.body, 1200);
      if (sharePreview) {
        console.log('[DBG] schedule shareMessage body:', sharePreview);
      }
      const extraPreview = buildExtra(attachment);
      if (extraPreview) {
        const max = 1200;
        const trimmed = extraPreview.length > max ? `${extraPreview.slice(0, max)}...` : extraPreview;
        console.log(`[DBG] schedule extra (${extraPreview.length}):`, trimmed);
      }
    }

    const scheduleIdCandidate = parseInt(String(eId).split('_')[0], 10);
    const scheduleId = Number.isFinite(scheduleIdCandidate) ? scheduleIdCandidate : undefined;
    const postId = Number.isFinite(scheduleIdCandidate) ? undefined : eId;

    attachment = ensureScheduleAttachment(attachment, {
      eventAt: eventAtSec,
      alarmAt: alarmAtSec,
      title: payload.title,
      subtype: payload.subtype ?? 1,
      scheduleId,
      postId,
    });

    if (payload.extra && typeof payload.extra === 'object' && attachment && typeof attachment === 'object' && !Array.isArray(attachment)) {
      attachment = { ...attachment, ...payload.extra };
    }

    const forceWrite = !!(opts as any).forceWrite;
    if (!forceWrite) {
      return {
        eventId: eId,
        share: shareRes?.body ?? shareRes,
        attachment,
      };
    }

    return this._sendWithAttachment(
      chatId,
      MessageType.Schedule,
      opts.text || payload.title || '',
      attachment,
      opts,
      'schedule'
    );
  }

async function sendLink(this: KakaoForgeClient, chatId: number | string, link: string | LinkPayload | AttachmentInput, opts: AttachmentSendOptions = {}) {
    if (typeof link === 'string') {
      const { text: _text, ...sendOpts } = opts;
      return this.sendMessage(chatId, link, MessageType.Text, sendOpts);
    }

    const normalized = normalizeLinkAttachment(link);
    const fallbackText = link && typeof link === 'object'
      ? ((link as LinkPayload).text || (link as LinkPayload).url || '')
      : '';
    const text = opts.text || fallbackText || '';
    const extra = buildExtra(normalized, opts.extra);

    if (!extra) {
      const { text: _text, extra: _extra, type, ...sendOpts } = opts;
      return this.sendMessage(chatId, text, MessageType.Text, sendOpts);
    }

    const { text: _text, ...sendOpts } = opts;
    return this.sendMessage(chatId, text, { ...sendOpts, type: MessageType.Link, extra });
  }

/**
 * Apply media mixin to KakaoForgeClient prototype
 */
export function applyMediaMixin(ClientClass: typeof KakaoForgeClient) {
  ClientClass.prototype._ensureVideoConf = _ensureVideoConf;
  ClientClass.prototype._getVideoProfile = _getVideoProfile;
  ClientClass.prototype._transcodeVideo = _transcodeVideo;
  ClientClass.prototype._uploadContactVCard = _uploadContactVCard;
  ClientClass.prototype._profileHeaders = _profileHeaders;
  ClientClass.prototype._fetchProfileAttachment = _fetchProfileAttachment;
  ClientClass.prototype._uploadMedia = _uploadMedia;
  ClientClass.prototype._sendWithAttachment = _sendWithAttachment;
  ClientClass.prototype._prepareMediaAttachment = _prepareMediaAttachment;
  ClientClass.prototype.uploadPhoto = uploadPhoto;
  ClientClass.prototype.uploadVideo = uploadVideo;
  ClientClass.prototype.uploadAudio = uploadAudio;
  ClientClass.prototype.uploadFile = uploadFile;
  ClientClass.prototype.sendPhoto = sendPhoto;
  ClientClass.prototype.sendPhotoAtThread = sendPhotoAtThread;
  ClientClass.prototype.sendVideo = sendVideo;
  ClientClass.prototype.sendVideoAtThread = sendVideoAtThread;
  ClientClass.prototype.sendAudio = sendAudio;
  ClientClass.prototype.sendAudioAtThread = sendAudioAtThread;
  ClientClass.prototype.sendFile = sendFile;
  ClientClass.prototype.sendFileAtThread = sendFileAtThread;
  ClientClass.prototype.sendContact = sendContact;
  ClientClass.prototype.sendKakaoProfile = sendKakaoProfile;
  ClientClass.prototype.sendLocation = sendLocation;
  ClientClass.prototype.sendSchedule = sendSchedule;
  ClientClass.prototype.sendLink = sendLink;
}
