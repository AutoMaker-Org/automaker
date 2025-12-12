import {
  query,
  Options,
  SDKAssistantMessage,
} from "@anthropic-ai/claude-agent-sdk";
import { NextRequest, NextResponse } from "next/server";
import path from "path";

const systemPrompt = `You are an AI assistant helping users build software. You are part of the Automaker application,
which is designed to help developers plan, design, and implement software projects autonomously.

Your role is to:
- Help users define their project requirements and specifications
- Ask clarifying questions to better understand their needs
- Suggest technical approaches and architectures
- Guide them through the development process
- Be conversational and helpful
- Write, edit, and modify code files as requested
- Execute commands and tests
- Search and analyze the codebase

When discussing projects, help users think through:
- Core functionality and features
- Technical stack choices
- Data models and architecture
- User experience considerations
- Testing strategies

You have full access to the codebase and can:
- Read files to understand existing code
- Write new files
- Edit existing files
- Run bash commands
- Search for code patterns
- Execute tests and builds`;

export async function POST(request: NextRequest) {
  try {
    const { messages, workingDirectory } = await request.json();

    console.log(
      "[API] CLAUDE_CODE_OAUTH_TOKEN present:",
      !!process.env.CLAUDE_CODE_OAUTH_TOKEN
    );

    if (!process.env.CLAUDE_CODE_OAUTH_TOKEN) {
      return NextResponse.json(
        { error: "CLAUDE_CODE_OAUTH_TOKEN not configured" },
        { status: 500 }
      );
    }

    // Get the last user message
    const lastMessage = messages[messages.length - 1];

    // Determine working directory - default to parent of app directory
    const cwd = workingDirectory || path.resolve(process.cwd(), "..");

    console.log("[API] Working directory:", cwd);

    // Create query with options that enable code modification
    const options: Options = {
      // model: "claude-sonnet-4-20250514",
      model: "claude-opus-4-5-20251101",
      systemPrompt,
      maxTurns: 20,
      cwd,
      // Enable all core tools for code modification
      allowedTools: [
        "Read",
        "Write",
        "Edit",
        "Glob",
        "Grep",
        "Bash",
        "WebSearch",
        "WebFetch",
      ],
      // Auto-accept file edits within the working directory
      permissionMode: "acceptEdits",
      // Enable sandbox for safer bash execution
      sandbox: {
        enabled: true,
        autoAllowBashIfSandboxed: true,
      },
    };

    // Convert message history to SDK format to preserve conversation context
    // Include both user and assistant messages for full context
    const sessionId = `api-session-${Date.now()}`;
    const conversationMessages = messages.map(
      (msg: { role: string; content: string }) => {
        if (msg.role === "user") {
          return {
            type: "user" as const,
            message: {
              role: "user" as const,
              content: msg.content,
            },
            parent_tool_use_id: null,
            session_id: sessionId,
          };
        } else {
          // Assistant message
          return {
            type: "assistant" as const,
            message: {
              role: "assistant" as const,
              content: [
                {
                  type: "text" as const,
                  text: msg.content,
                },
              ],
            },
            session_id: sessionId,
          };
        }
      }
    );

    // Execute query with full conversation context
    const queryResult = query({
      prompt:
        conversationMessages.length > 0
          ? conversationMessages
          : lastMessage.content,
      options,
    });

    let responseText = "";
    const toolUses: Array<{ name: string; input: unknown }> = [];

    // Collect the response from the async generator
    for await (const msg of queryResult) {
      if (msg.type === "assistant") {
        const assistantMsg = msg as SDKAssistantMessage;
        if (assistantMsg.message.content) {
          for (const block of assistantMsg.message.content) {
            if (block.type === "text") {
              responseText += block.text;
            } else if (block.type === "tool_use") {
              // Track tool usage for transparency
              toolUses.push({
                name: block.name,
                input: block.input,
              });
            }
          }
        }
      } else if (msg.type === "result") {
        if (msg.subtype === "success") {
          if (msg.result) {
            responseText = msg.result;
          }
        }
      }
    }

    return NextResponse.json({
      content: responseText || "Sorry, I couldn't generate a response.",
      toolUses: toolUses.length > 0 ? toolUses : undefined,
    });
  } catch (error: unknown) {
    console.error("Claude API error:", error);
    const errorMessage =
      error instanceof Error
        ? error.message
        : "Failed to get response from Claude";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
