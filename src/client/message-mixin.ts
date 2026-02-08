import { Long } from 'bson';
import {
  MessageType,
  type SendOptions,
  type ReplyTarget,
  type ReplyOptions,
  type EditMessageOptions,
  type MessageEvent,
} from '../types';
import {
  extractMarkedMentions,
  extractMarkedSpoilers,
  normalizeMentionInputs,
  normalizeSpoilerInputs,
  buildExtra,
  normalizeReplyTarget,
  buildReplyAttachment,
  normalizeLogTarget,
  normalizeEditTarget,
} from '../utils';

import type { KakaoForgeClient } from './client';

/**
 * Message mixin interface - declares methods added to KakaoForgeClient
 */
export interface MessageMixin {
  sendMessage(
    chatId: number | string,
    text: string,
    type?: number | SendOptions,
    opts?: SendOptions
  ): Promise<any>;
  sendText(chatId: number | string, text: string, opts?: SendOptions): Promise<any>;
  sendReply(
    chatId: number | string,
    text: string,
    replyTo: ReplyTarget | MessageEvent | any,
    opts?: ReplyOptions
  ): Promise<any>;
  sendThreadReply(
    chatId: number | string,
    threadId: number | string,
    text: string,
    opts?: SendOptions
  ): Promise<any>;
  deleteMessage(chatId: number | string, target: any): Promise<any>;
  editMessage(
    chatId: number | string,
    target: any,
    text: string,
    opts?: EditMessageOptions
  ): Promise<any>;
}

/**
 * Send a text message to a chatroom (LOCO WRITE).
 */
async function sendMessage(
  this: KakaoForgeClient,
  chatId: number | string,
  text: string,
  type: number | SendOptions = 1,
  opts: SendOptions = {}
) {
  let msgType = typeof type === 'number' ? type : 1;
  if (type && typeof type === 'object') {
    opts = type;
    msgType = typeof opts.type === 'number' ? opts.type : 1;
  }
  if (!opts || typeof opts !== 'object') opts = {};

  let messageText = text || '';
  const extractedMentions = extractMarkedMentions(messageText);
  if (extractedMentions.mentions.length > 0) {
    messageText = extractedMentions.text;
    const mergedMentions = Array.isArray(opts.mentions)
      ? [...opts.mentions, ...extractedMentions.mentions]
      : extractedMentions.mentions;
    opts = { ...opts, mentions: mergedMentions };
  }

  const extractedSpoilers = extractMarkedSpoilers(messageText);
  if (extractedSpoilers.spoilers.length > 0) {
    messageText = extractedSpoilers.text;
    const mergedSpoilers = Array.isArray(opts.spoilers)
      ? [...opts.spoilers, ...extractedSpoilers.spoilers]
      : extractedSpoilers.spoilers;
    opts = { ...opts, spoilers: mergedSpoilers };
  }

  const msgId = opts.msgId !== undefined && opts.msgId !== null ? opts.msgId : this._nextClientMsgId();
  const writeOpts: any = {
    ...opts,
    msgId,
    noSeen: opts.noSeen ?? false,
    scope: typeof opts.scope === 'number' ? opts.scope : 1,
    silence: opts.silence ?? (opts as any).isSilence ?? false,
  };
  const normalizedMentions = normalizeMentionInputs(messageText || '', opts.mentions);
  const normalizedSpoilers = normalizeSpoilerInputs(messageText || '', opts.spoilers);
  if (normalizedMentions.length > 0 || normalizedSpoilers.length > 0) {
    const sourceExtra: any = opts.extra as any;
    let extraObj: any = {};
    if (sourceExtra && typeof sourceExtra === 'object' && !Array.isArray(sourceExtra)) {
      extraObj = { ...sourceExtra };
    }
    if (normalizedMentions.length > 0) {
      extraObj.mentions = normalizedMentions;
    }
    if (normalizedSpoilers.length > 0) {
      extraObj.spoilers = normalizedSpoilers;
    }
    writeOpts.extra = buildExtra(extraObj);
  }

  if (!this._carriage && !this._locoAutoConnectAttempted) {
    this._locoAutoConnectAttempted = true;
    try {
      await this.connect();
    } catch (err: any) {
      if (this.debug) {
        console.error('[DBG] LOCO auto-connect failed:', err.message);
      }
    }
  }

  if (!this._carriage) {
    throw new Error('LOCO not connected. Call client.connect() first.');
  }

  const resolvedChatId = this._resolveChatId(chatId);
  return await this._enqueueSend(() => {
    if (!this._carriage) {
      throw new Error('LOCO not connected. Call client.connect() first.');
    }
    return this._carriage.write(resolvedChatId, messageText, msgType, writeOpts);
  });
}

async function sendText(
  this: KakaoForgeClient,
  chatId: number | string,
  text: string,
  opts: SendOptions = {}
) {
  return this.sendMessage(chatId, text, MessageType.Text, opts);
}

async function sendReply(
  this: KakaoForgeClient,
  chatId: number | string,
  text: string,
  replyTo: ReplyTarget | MessageEvent | any,
  opts: ReplyOptions = {}
) {
  const target = normalizeReplyTarget(replyTo);
  if (!target || !target.logId || !target.userId) {
    throw new Error('reply target requires logId/userId');
  }
  const attachment = buildReplyAttachment(target, opts);
  const extra = buildExtra(attachment, opts.extra);
  if (!extra) {
    throw new Error('reply attachment is required');
  }
  const { extra: _extra, attachOnly: _attachOnly, attachType: _attachType, ...sendOpts } = opts as ReplyOptions;
  return this.sendMessage(chatId, text, { ...sendOpts, type: MessageType.Reply, extra });
}

async function sendThreadReply(
  this: KakaoForgeClient,
  chatId: number | string,
  threadId: number | string,
  text: string,
  opts: SendOptions = {}
) {
  const threadValue = Long.isLong(threadId) ? threadId : Long.fromString(String(threadId));
  let scope = typeof opts.scope === 'number' ? opts.scope : undefined;
  if (scope === undefined) {
    if ((opts as any).sendToChatRoom === true) {
      scope = 3;
    } else {
      scope = 2;
    }
  }
  return this.sendMessage(chatId, text, {
    ...opts,
    type: MessageType.Text,
    threadId: threadValue,
    scope,
  });
}

/**
 * Delete a message for everyone (DELETEMSG).
 */
async function deleteMessage(this: KakaoForgeClient, chatId: number | string, target: any) {
  const logId = normalizeLogTarget(target);
  if (!logId) {
    throw new Error('deleteMessage requires a logId or MessageEvent');
  }

  if (!this._carriage && !this._locoAutoConnectAttempted) {
    this._locoAutoConnectAttempted = true;
    try {
      await this.connect();
    } catch (err: any) {
      if (this.debug) {
        console.error('[DBG] LOCO auto-connect failed:', err.message);
      }
    }
  }

  if (!this._carriage) {
    throw new Error('LOCO not connected. Call client.connect() first.');
  }

  const resolvedChatId = this._resolveChatId(chatId);
  return await this._carriage.deleteMsg(resolvedChatId, logId);
}

/**
 * Modify a text message within 24 hours (MODIFYMSG).
 */
async function editMessage(
  this: KakaoForgeClient,
  chatId: number | string,
  target: any,
  text: string,
  opts: EditMessageOptions = {}
) {
  const normalized = normalizeEditTarget(target);
  if (!normalized?.logId) {
    throw new Error('editMessage requires a logId or MessageEvent');
  }

  if (!this._carriage && !this._locoAutoConnectAttempted) {
    this._locoAutoConnectAttempted = true;
    try {
      await this.connect();
    } catch (err: any) {
      if (this.debug) {
        console.error('[DBG] LOCO auto-connect failed:', err.message);
      }
    }
  }

  if (!this._carriage) {
    throw new Error('LOCO not connected. Call client.connect() first.');
  }

  const type = typeof opts.type === 'number'
    ? opts.type
    : (normalized.type ?? MessageType.Text);
  let extra =
    opts.extra !== undefined
      ? (typeof opts.extra === 'string' ? opts.extra : buildExtra(opts.extra as any))
      : normalized.extra;
  if (extra === undefined) {
    extra = '{}';
  }
  const resolvedChatId = this._resolveChatId(chatId);
  return await this._carriage.modifyMsg(resolvedChatId, normalized.logId, text, {
    type,
    extra,
    supplement: opts.supplement,
  });
}

/**
 * Apply message mixin to KakaoForgeClient prototype
 */
export function applyMessageMixin(ClientClass: typeof KakaoForgeClient) {
  ClientClass.prototype.sendMessage = sendMessage;
  ClientClass.prototype.sendText = sendText;
  ClientClass.prototype.sendReply = sendReply;
  ClientClass.prototype.sendThreadReply = sendThreadReply;
  ClientClass.prototype.deleteMessage = deleteMessage;
  ClientClass.prototype.editMessage = editMessage;
}
