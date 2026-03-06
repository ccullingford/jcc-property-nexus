/**
 * Microsoft Entra ID (Azure AD) OAuth 2.0 authentication service.
 *
 * Uses the Authorization Code flow with PKCE for secure browser-based sign-in.
 * After the Microsoft callback, the user's email is validated against the
 * users table. Only pre-registered users (or domain-matched auto-bootstrap)
 * are granted access.
 *
 * Required env vars:
 *   MICROSOFT_CLIENT_ID     — Azure AD app client ID
 *   MICROSOFT_CLIENT_SECRET — Azure AD app client secret
 *   MICROSOFT_TENANT_ID     — Azure AD tenant ID (or "common" for multi-tenant)
 *
 * Optional:
 *   ALLOWED_EMAIL_DOMAIN    — e.g. "contoso.com" — domain validated on login;
 *                             also used for auto-bootstrap when users table is empty
 */

import { createHash, randomBytes } from "crypto";

export interface MicrosoftUserInfo {
  id: string;
  displayName: string;
  mail: string | null;
  userPrincipalName: string;
}

// ── PKCE helpers ─────────────────────────────────────────────────────────────

export function generateCodeVerifier(): string {
  return randomBytes(48).toString("base64url");
}

export function generateCodeChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

export function generateState(): string {
  return randomBytes(24).toString("base64url");
}

// ── OAuth URL builder ─────────────────────────────────────────────────────────

export function buildAuthorizationUrl(params: {
  clientId: string;
  tenantId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
}): string {
  const query = new URLSearchParams({
    client_id: params.clientId,
    response_type: "code",
    redirect_uri: params.redirectUri,
    response_mode: "query",
    scope: "openid profile email User.Read Mail.Read offline_access",
    state: params.state,
    code_challenge: params.codeChallenge,
    code_challenge_method: "S256",
    prompt: "select_account",
  });
  return `https://login.microsoftonline.com/${params.tenantId}/oauth2/v2.0/authorize?${query}`;
}

// ── Token exchange ────────────────────────────────────────────────────────────

export interface TokenResponse {
  access_token: string;
  id_token?: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  error?: string;
  error_description?: string;
}

export async function exchangeCodeForToken(params: {
  clientId: string;
  clientSecret: string;
  tenantId: string;
  redirectUri: string;
  code: string;
  codeVerifier: string;
}): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: params.clientId,
    client_secret: params.clientSecret,
    redirect_uri: params.redirectUri,
    code: params.code,
    code_verifier: params.codeVerifier,
    scope: "openid profile email User.Read Mail.Read offline_access",
  });

  const res = await fetch(
    `https://login.microsoftonline.com/${params.tenantId}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    }
  );

  const data: TokenResponse = await res.json();
  if (data.error) {
    throw new Error(`Token exchange failed: ${data.error_description || data.error}`);
  }
  return data;
}

// ── Token refresh ─────────────────────────────────────────────────────────────

export async function refreshAccessToken(params: {
  clientId: string;
  clientSecret: string;
  tenantId: string;
  refreshToken: string;
}): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: params.clientId,
    client_secret: params.clientSecret,
    refresh_token: params.refreshToken,
    scope: "openid profile email User.Read Mail.Read offline_access",
  });

  const res = await fetch(
    `https://login.microsoftonline.com/${params.tenantId}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    }
  );

  const data: TokenResponse = await res.json();
  if (data.error) {
    throw new Error(`Token refresh failed: ${data.error_description || data.error}`);
  }
  return data;
}

// ── User profile ──────────────────────────────────────────────────────────────

export async function getMicrosoftUserProfile(
  accessToken: string
): Promise<MicrosoftUserInfo> {
  const res = await fetch(
    "https://graph.microsoft.com/v1.0/me?$select=id,displayName,mail,userPrincipalName",
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to fetch Microsoft profile: ${text}`);
  }

  return res.json() as Promise<MicrosoftUserInfo>;
}

/** Returns the canonical email for a Microsoft user. */
export function getCanonicalEmail(profile: MicrosoftUserInfo): string {
  // mail is preferred; userPrincipalName is fallback (may have # for external users)
  const email = profile.mail || profile.userPrincipalName;
  return email.toLowerCase().trim();
}

// ── Configuration helpers ─────────────────────────────────────────────────────

export interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  tenantId: string;
  allowedDomain: string | null;
}

export function getOAuthConfig(): OAuthConfig | null {
  const { MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET, MICROSOFT_TENANT_ID } =
    process.env;
  if (!MICROSOFT_CLIENT_ID || !MICROSOFT_CLIENT_SECRET || !MICROSOFT_TENANT_ID) {
    return null;
  }
  return {
    clientId: MICROSOFT_CLIENT_ID,
    clientSecret: MICROSOFT_CLIENT_SECRET,
    tenantId: MICROSOFT_TENANT_ID,
    allowedDomain: process.env.ALLOWED_EMAIL_DOMAIN?.toLowerCase() ?? null,
  };
}

export function isOAuthConfigured(): boolean {
  return getOAuthConfig() !== null;
}

/** Derive a display name from a Microsoft profile. */
export function getDisplayName(profile: MicrosoftUserInfo): string {
  return (
    profile.displayName ||
    profile.mail?.split("@")[0] ||
    profile.userPrincipalName.split("@")[0]
  );
}
