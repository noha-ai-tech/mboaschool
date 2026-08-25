export const ACTIVE_SCHOOL_COOKIE = "ecoles237_active_school";
export const SCHOOL_QUERY_PARAM = "school";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type EstablishmentContextSource = "url" | "cookie" | "single" | null;

export type EstablishmentContextResolution = {
  establishmentId: string | null;
  source: EstablishmentContextSource;
  reason: "resolved" | "invalid_url" | "inaccessible_url" | "selection_required" | "none";
};

export function isValidEstablishmentId(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

export function scalarSearchParam(value: string | string[] | null | undefined): string | null {
  return typeof value === "string" ? value : null;
}

export function resolveEstablishmentContext(input: {
  explicitId?: string | null;
  cookieId?: string | null;
  accessibleIds: string[];
}): EstablishmentContextResolution {
  const accessible = new Set(input.accessibleIds);

  if (input.explicitId != null) {
    if (!isValidEstablishmentId(input.explicitId)) {
      return { establishmentId: null, source: null, reason: "invalid_url" };
    }
    if (!accessible.has(input.explicitId)) {
      return { establishmentId: null, source: null, reason: "inaccessible_url" };
    }
    return { establishmentId: input.explicitId, source: "url", reason: "resolved" };
  }

  if (isValidEstablishmentId(input.cookieId) && accessible.has(input.cookieId)) {
    return { establishmentId: input.cookieId, source: "cookie", reason: "resolved" };
  }

  if (input.accessibleIds.length === 1) {
    return { establishmentId: input.accessibleIds[0], source: "single", reason: "resolved" };
  }

  if (input.accessibleIds.length > 1) {
    return { establishmentId: null, source: null, reason: "selection_required" };
  }

  return { establishmentId: null, source: null, reason: "none" };
}

export function withEstablishmentQuery(href: string, establishmentId: string | null): string {
  const url = new URL(href, "https://ecoles237.invalid");
  if (establishmentId && isValidEstablishmentId(establishmentId)) {
    url.searchParams.set(SCHOOL_QUERY_PARAM, establishmentId);
  } else {
    url.searchParams.delete(SCHOOL_QUERY_PARAM);
  }
  return `${url.pathname}${url.search}${url.hash}`;
}

export function safeProReturnPath(value: string | null | undefined): string {
  if (!value || !value.startsWith("/pro/") || value.startsWith("//")) {
    return "/pro/personnel";
  }
  return value;
}
