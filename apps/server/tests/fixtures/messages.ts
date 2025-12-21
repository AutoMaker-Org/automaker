/**
 * Message fixtures for testing providers and lib utilities
 */

import type {
  ConversationMessage,
  ProviderMessage,
  ContentBlock,
} from "@automaker/types";

export const conversationHistoryFixture: ConversationMessage[] = [
  {
    role: "user",
    content: "Hello, can you help me?",
  },
  {
    role: "assistant",
    content: "Of course! How can I assist you today?",
  },
  {
    role: "user",
    content: [
      { type: "text", text: "What is in this image?" },
      {
        type: "image",
        source: { type: "base64", media_type: "image/png", data: "base64data" },
      },
    ],
  },
];

export const claudeProviderMessageFixture: ProviderMessage = {
  type: "assistant",
  message: {
    role: "assistant",
    content: [{ type: "text", text: "This is a test response" }],
  },
};

