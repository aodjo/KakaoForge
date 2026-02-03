import type { MessageTypeValue } from './message';

export const AttachmentTypes = {
  Photo: 'photo',
  Video: 'video',
  Audio: 'audio',
  File: 'file',
  Contact: 'contact',
  Location: 'location',
  Schedule: 'schedule',
  Link: 'link',
  Unknown: 'unknown',
} as const;

export type AttachmentType = typeof AttachmentTypes[keyof typeof AttachmentTypes];

export type MessageAttachment = {
  type: MessageTypeValue;
  raw: any;
};
