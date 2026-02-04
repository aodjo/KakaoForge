export const Reactions = {
  CANCEL: 0,
  HEART: 1,
  LIKE: 2,
  CHECK: 3,
  LAUGH: 4,
  SURPRISE: 5,
  SAD: 6,
} as const;

export type ReactionTypeValue = (typeof Reactions)[keyof typeof Reactions];
