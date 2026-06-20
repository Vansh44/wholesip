export const BLOG_REACTIONS = [
  "like",
  "love",
  "haha",
  "wow",
  "celebrate",
] as const;
export type BlogReaction = (typeof BLOG_REACTIONS)[number];

export type ReactionCounts = Record<BlogReaction, number>;
