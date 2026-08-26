import { NextResponse } from "next/server";

export const TARGETED_INVITATION_COOKIE = "ecoles237_targeted_invitation";
export const TARGETED_INVITATION_MAX_AGE_SECONDS = 10 * 60;
export const TARGETED_INVITATION_COOKIE_PATH = "/auth";

const TOKEN_PATTERN = /^[0-9a-f]{64}$/;

export function isTargetedInvitationToken(value: unknown): value is string {
  return typeof value === "string" && TOKEN_PATTERN.test(value);
}

export function secureInvitationResponse(response: NextResponse): NextResponse {
  response.headers.set("Cache-Control", "no-store, max-age=0");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  return response;
}

export function setTargetedInvitationCookie(
  response: NextResponse,
  token: string,
): NextResponse {
  response.cookies.set(TARGETED_INVITATION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: TARGETED_INVITATION_COOKIE_PATH,
    maxAge: TARGETED_INVITATION_MAX_AGE_SECONDS,
  });
  return response;
}

export function clearTargetedInvitationCookie(response: NextResponse): NextResponse {
  response.cookies.set(TARGETED_INVITATION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: TARGETED_INVITATION_COOKIE_PATH,
    maxAge: 0,
  });
  return response;
}
