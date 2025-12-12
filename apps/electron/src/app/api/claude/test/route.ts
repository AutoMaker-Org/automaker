import { NextRequest, NextResponse } from "next/server";

interface AnthropicResponse {
  content?: Array<{ type: string; text?: string }>;
  model?: string;
  error?: { message?: string };
}

export async function POST(request: NextRequest) {
  try {
    const { apiKey } = await request.json();

    // Use provided API key or fall back to environment variable
    const effectiveApiKey = apiKey || process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_CODE_OAUTH_TOKEN;

    if (!effectiveApiKey) {
      return NextResponse.json(
        { success: false, error: "No API key provided or configured in environment" },
        { status: 400 }
      );
    }

    // Send a simple test prompt to the Anthropic API
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": effectiveApiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 100,
        messages: [
          {
            role: "user",
            content: "Respond with exactly: 'Claude API connection successful!' and nothing else.",
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorData = (await response.json()) as AnthropicResponse;
      const errorMessage = errorData.error?.message || `HTTP ${response.status}`;

      if (response.status === 401) {
        return NextResponse.json(
          { success: false, error: "Invalid API key. Please check your Anthropic API key." },
          { status: 401 }
        );
      }

      if (response.status === 429) {
        return NextResponse.json(
          { success: false, error: "Rate limit exceeded. Please try again later." },
          { status: 429 }
        );
      }

      return NextResponse.json(
        { success: false, error: `API error: ${errorMessage}` },
        { status: response.status }
      );
    }

    const data = (await response.json()) as AnthropicResponse;

    // Check if we got a valid response
    if (data.content && data.content.length > 0) {
      const textContent = data.content.find((block) => block.type === "text");
      if (textContent && textContent.type === "text" && textContent.text) {
        return NextResponse.json({
          success: true,
          message: `Connection successful! Response: "${textContent.text}"`,
          model: data.model,
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: "Connection successful! Claude responded.",
      model: data.model,
    });
  } catch (error: unknown) {
    console.error("Claude API test error:", error);

    const errorMessage =
      error instanceof Error ? error.message : "Failed to connect to Claude API";

    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}
