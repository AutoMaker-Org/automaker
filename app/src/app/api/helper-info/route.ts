import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { tmpdir } from "os";
import path from "path";

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    const infoPath = path.join(tmpdir(), "automaker-helper.json");
    const content = await readFile(infoPath, "utf-8");
    const info = JSON.parse(content);

    const response = NextResponse.json({
      port: info.port,
      token: info.token,
      timestamp: Date.now(), // Cache buster
    });

    // Aggressive no-cache headers
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
    response.headers.set('Pragma', 'no-cache');
    response.headers.set('Expires', '0');

    return response;
  } catch (error) {
    // Helper service not running or info file doesn't exist
    const response = NextResponse.json(
      { error: "Helper service connection info not found" },
      { status: 404 }
    );
    response.headers.set('Cache-Control', 'no-store');
    return response;
  }
}
