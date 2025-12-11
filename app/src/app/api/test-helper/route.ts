import { NextResponse } from "next/server";

export async function GET() {
  const tests = [];

  // Test 1: Check if helper info file exists
  try {
    const response = await fetch("http://localhost:3007/api/helper-info");
    const data = await response.json();
    tests.push({
      test: "API /api/helper-info",
      status: "✓ PASS",
      data,
    });
  } catch (error: any) {
    tests.push({
      test: "API /api/helper-info",
      status: "✗ FAIL",
      error: error.message,
    });
  }

  // Test 2: Check helper service health
  try {
    const infoResponse = await fetch("http://localhost:3007/api/helper-info");
    const info = await infoResponse.json();

    const healthResponse = await fetch(
      `http://localhost:${info.port}/health`,
      {
        headers: {
          Origin: "http://localhost:3007",
        },
      }
    );
    const healthData = await healthResponse.json();
    tests.push({
      test: "Helper Service Health",
      status: "✓ PASS",
      port: info.port,
      data: healthData,
    });
  } catch (error: any) {
    tests.push({
      test: "Helper Service Health",
      status: "✗ FAIL",
      error: error.message,
    });
  }

  return NextResponse.json({
    timestamp: new Date().toISOString(),
    tests,
  });
}
