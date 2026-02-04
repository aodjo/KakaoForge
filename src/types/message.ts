export const MessageType = {
  Text: 1,
  Photo: 2,
  Video: 3,
  Contact: 4,
  Audio: 5,
  Link: 9,
  Schedule: 13,
  Location: 16,
  Profile: 17,
  File: 18,
  Reply: 26,
} as const;

export type MessageTypeValue = typeof MessageType[keyof typeof MessageType] | number;
