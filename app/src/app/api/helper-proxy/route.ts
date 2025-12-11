import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { tmpdir } from "os";
import path from "path";

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest) {
  try {
    // Get helper connection info
    const infoPath = path.join(tmpdir(), "automaker-helper.json");
    const content = await readFile(infoPath, "utf-8");
    const info = JSON.parse(content);

    // Make server-side request to helper (bypasses browser CORS)
    const healthResponse = await fetch(`http://localhost:${info.port}/health`);

    if (!healthResponse.ok) {
      return NextResponse.json(
        { error: `Helper returned status ${healthResponse.status}` },
        { status: 502 }
      );
    }

    const healthData = await healthResponse.json();

    const response = NextResponse.json({
      connected: true,
      port: info.port,
      token: info.token,
      health: healthData,
      timestamp: Date.now(),
    });

    // No cache
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    response.headers.set('Access-Control-Allow-Origin', '*');

    return response;
  } catch (error: any) {
    return NextResponse.json(
      {
        connected: false,
        error: error.message,
        timestamp: Date.now()
      },
      { status: 503 }
    );
  }
}

// Handle OPTIONS for CORS
export async function OPTIONS() {
  const response = new NextResponse(null, { status: 204 });
  response.headers.set('Access-Control-Allow-Origin', '*');
  response.headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type');
  return response;
}
