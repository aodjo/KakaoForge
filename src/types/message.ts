export const MessageType = {
  Text: 1,
  Photo: 2,
  Video: 3,
  Contact: 4,
  Audio: 5,
  Link: 9,
  Schedule: 13,
  Location: 16,
  File: 18,
} as const;

export type MessageTypeValue = typeof MessageType[keyof typeof MessageType] | number;
