import { NextRequest, NextResponse } from "next/server";

interface GeminiContent {
  parts: Array<{
    text?: string;
    inlineData?: {
      mimeType: string;
      data: string;
    };
  }>;
  role?: string;
}

interface GeminiRequest {
  contents: GeminiContent[];
  generationConfig?: {
    maxOutputTokens?: number;
    temperature?: number;
  };
}

interface GeminiResponse {
  candidates?: Array<{
    content: {
      parts: Array<{
        text: string;
      }>;
      role: string;
    };
    finishReason: string;
    safetyRatings?: Array<{
      category: string;
      probability: string;
    }>;
  }>;
  promptFeedback?: {
    safetyRatings?: Array<{
      category: string;
      probability: string;
    }>;
  };
  error?: {
    code: number;
    message: string;
    status: string;
  };
}

export async function POST(request: NextRequest) {
  try {
    const { apiKey, imageData, mimeType, prompt } = await request.json();

    // Use provided API key or fall back to environment variable
    const effectiveApiKey = apiKey || process.env.GOOGLE_API_KEY;

    if (!effectiveApiKey) {
      return NextResponse.json(
        { success: false, error: "No API key provided or configured in environment" },
        { status: 400 }
      );
    }

    // Build the request body
    const requestBody: GeminiRequest = {
      contents: [
        {
          parts: [],
        },
      ],
      generationConfig: {
        maxOutputTokens: 150,
        temperature: 0.4,
      },
    };

    // Add image if provided
    if (imageData && mimeType) {
      requestBody.contents[0].parts.push({
        inlineData: {
          mimeType: mimeType,
          data: imageData,
        },
      });
    }

    // Add text prompt
    const textPrompt = prompt || (imageData
      ? "Describe what you see in this image briefly."
      : "Respond with exactly: 'Gemini SDK connection successful!' and nothing else.");

    requestBody.contents[0].parts.push({
      text: textPrompt,
    });

    // Call Gemini API - using gemini-1.5-flash as it supports both text and vision
    const model = imageData ? "gemini-1.5-flash" : "gemini-1.5-flash";
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${effectiveApiKey}`;

    const response = await fetch(geminiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    const data: GeminiResponse = await response.json();

    // Check for API errors
    if (data.error) {
      const errorMessage = data.error.message || "Unknown Gemini API error";
      const statusCode = data.error.code || 500;

      if (statusCode === 400 && errorMessage.includes("API key")) {
        return NextResponse.json(
          { success: false, error: "Invalid API key. Please check your Google API key." },
          { status: 401 }
        );
      }

      if (statusCode === 429) {
        return NextResponse.json(
          { success: false, error: "Rate limit exceeded. Please try again later." },
          { status: 429 }
        );
      }

      return NextResponse.json(
        { success: false, error: `API error: ${errorMessage}` },
        { status: statusCode }
      );
    }

    // Check for valid response
    if (!response.ok) {
      return NextResponse.json(
        { success: false, error: `HTTP error: ${response.status} ${response.statusText}` },
        { status: response.status }
      );
    }

    // Extract response text
    if (data.candidates && data.candidates.length > 0 && data.candidates[0].content?.parts?.length > 0) {
      const responseText = data.candidates[0].content.parts
        .filter((part) => part.text)
        .map((part) => part.text)
        .join("");

      return NextResponse.json({
        success: true,
        message: `Connection successful! Response: "${responseText.substring(0, 200)}${responseText.length > 200 ? '...' : ''}"`,
        model: model,
        hasImage: !!imageData,
      });
    }

    // Handle blocked responses
    if (data.promptFeedback?.safetyRatings) {
      return NextResponse.json({
        success: true,
        message: "Connection successful! Gemini responded (response may have been filtered).",
        model: model,
        hasImage: !!imageData,
      });
    }

    return NextResponse.json({
      success: true,
      message: "Connection successful! Gemini responded.",
      model: model,
      hasImage: !!imageData,
    });
  } catch (error: unknown) {
    console.error("Gemini API test error:", error);

    if (error instanceof TypeError && error.message.includes("fetch")) {
      return NextResponse.json(
        { success: false, error: "Network error. Unable to reach Gemini API." },
        { status: 503 }
      );
    }

    const errorMessage =
      error instanceof Error ? error.message : "Failed to connect to Gemini API";

    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}
