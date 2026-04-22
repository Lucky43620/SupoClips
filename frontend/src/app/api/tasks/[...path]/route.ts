import { NextResponse } from "next/server";

import { createProxyResponse, fetchBackend } from "@/server/backend-api";
import { getServerSession } from "@/server/session";

async function proxyTaskRequest(
  request: Request,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const session = await getServerSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Connexion requise" }, { status: 401 });
  }

  const { path } = await params;
  const incomingUrl = new URL(request.url);
  const targetPath = `/tasks/${path.join("/")}${incomingUrl.search}`;
  const body =
    request.method === "GET" || request.method === "HEAD"
      ? undefined
      : await request.text();

  // Forward Range header for video streaming support
  const rangeHeader = request.headers.get("range");

  const upstream = await fetchBackend(targetPath, {
    method: request.method,
    userId: session.user.id,
    extraHeaders: {
      ...(body && request.headers.get("content-type")
        ? { "Content-Type": request.headers.get("content-type") as string }
        : {}),
      ...(request.headers.get("accept")
        ? { Accept: request.headers.get("accept") as string }
        : {}),
      ...(rangeHeader ? { Range: rangeHeader } : {}),
    },
    body,
    cache: "no-store",
  });

  // For video responses, forward additional headers needed for seeking
  const contentType = upstream.headers.get("content-type") || "";
  const isVideo = contentType.startsWith("video/");

  if (isVideo) {
    const responseHeaders = new Headers();
    for (const header of [
      "content-type",
      "content-length",
      "content-range",
      "accept-ranges",
      "cache-control",
      "content-disposition",
      "x-trace-id",
    ]) {
      const value = upstream.headers.get(header);
      if (value) responseHeaders.set(header, value);
    }
    return new Response(upstream.body, {
      status: upstream.status,
      headers: responseHeaders,
    });
  }

  return createProxyResponse(upstream);
}

export async function GET(
  request: Request,
  context: { params: Promise<{ path: string[] }> }
) {
  return proxyTaskRequest(request, context);
}

export async function POST(
  request: Request,
  context: { params: Promise<{ path: string[] }> }
) {
  return proxyTaskRequest(request, context);
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ path: string[] }> }
) {
  return proxyTaskRequest(request, context);
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ path: string[] }> }
) {
  return proxyTaskRequest(request, context);
}
