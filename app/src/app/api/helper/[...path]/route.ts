import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { tmpdir } from "os";
import path from "path";

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Proxy all requests to the helper service
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  return proxyToHelper(request, path, 'GET');
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  return proxyToHelper(request, path, 'POST');
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  return proxyToHelper(request, path, 'PUT');
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  return proxyToHelper(request, path, 'DELETE');
}

async function proxyToHelper(
  request: NextRequest,
  pathSegments: string[],
  method: string
) {
  try {
    // Get helper connection info
    const infoPath = path.join(tmpdir(), "automaker-helper.json");
    const content = await readFile(infoPath, "utf-8");
    const info = JSON.parse(content);

    // Construct target URL
    const helperPath = pathSegments.join('/');
    const url = `http://localhost:${info.port}/${helperPath}`;

    // Get request body if present
    let body;
    if (method !== 'GET' && method !== 'DELETE') {
      try {
        body = await request.json();
      } catch {
        // No body or invalid JSON
      }
    }

    // Forward request to helper
    const helperResponse = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${info.token}`,
      },
      ...(body && { body: JSON.stringify(body) }),
    });

    const data = await helperResponse.json();

    const response = NextResponse.json(data, {
      status: helperResponse.status,
    });

    // No cache headers
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    response.headers.set('Access-Control-Allow-Origin', '*');

    return response;
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 503 }
    );
  }
}

export async function OPTIONS() {
  const response = new NextResponse(null, { status: 204 });
  response.headers.set('Access-Control-Allow-Origin', '*');
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  return response;
}
