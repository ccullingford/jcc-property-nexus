/**
 * Microsoft Graph API client service.
 *
 * Authentication: Uses the Replit Outlook connector OAuth token when
 * available. Falls back to Azure AD client-credentials (app-only) when
 * MICROSOFT_TENANT_ID + MICROSOFT_CLIENT_ID + MICROSOFT_CLIENT_SECRET are set.
 *
 * Shared-mailbox reads use the /users/{email}/messages endpoint, which
 * requires either:
 *   - Delegated access where the authenticated user has Full Access or
 *     Read rights on the shared mailbox (connector path), OR
 *   - Application permission Mail.Read with admin consent (app-only path).
 */

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

export interface GraphMessage {
  id: string;
  conversationId: string;
  subject: string;
  bodyPreview: string;
  receivedDateTime: string;
  isRead: boolean;
  hasAttachments: boolean;
  from: { emailAddress: { name: string; address: string } };
  toRecipients: { emailAddress: { name: string; address: string } }[];
  body: { contentType: string; content: string };
}

export interface GraphAttachment {
  id: string;
  name: string;
  contentType: string;
  size: number;
}

// ── Token acquisition ────────────────────────────────────────────────────────

let _appOnlyTokenCache: { token: string; expiresAt: number } | null = null;

async function getAppOnlyToken(): Promise<string> {
  const { MICROSOFT_TENANT_ID, MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET } =
    process.env;
  if (!MICROSOFT_TENANT_ID || !MICROSOFT_CLIENT_ID || !MICROSOFT_CLIENT_SECRET) {
    throw new Error(
      "Microsoft Graph credentials not configured. Set MICROSOFT_TENANT_ID, MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET."
    );
  }

  if (_appOnlyTokenCache && Date.now() < _appOnlyTokenCache.expiresAt - 60_000) {
    return _appOnlyTokenCache.token;
  }

  const params = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: MICROSOFT_CLIENT_ID,
    client_secret: MICROSOFT_CLIENT_SECRET,
    scope: "https://graph.microsoft.com/.default",
  });

  const res = await fetch(
    `https://login.microsoftonline.com/${MICROSOFT_TENANT_ID}/oauth2/v2.0/token`,
    { method: "POST", body: params }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token request failed: ${text}`);
  }

  const data = await res.json();
  _appOnlyTokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  return data.access_token;
}

/**
 * Get a valid access token. Tries the Replit connector first,
 * then falls back to the app-only path.
 */
async function getAccessToken(connectorToken?: string): Promise<string> {
  if (connectorToken) return connectorToken;
  return getAppOnlyToken();
}

// ── Graph helpers ────────────────────────────────────────────────────────────

async function graphGet<T>(
  path: string,
  token: string
): Promise<T> {
  const res = await fetch(`${GRAPH_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Graph API error ${res.status} on ${path}: ${text}`);
  }
  return res.json() as Promise<T>;
}

// ── Public Graph operations ──────────────────────────────────────────────────

/**
 * Fetch messages from a mailbox inbox, paged.
 * For shared mailboxes use the mailbox email as `mailboxAddress`.
 */
export async function fetchMailboxMessages(
  mailboxAddress: string,
  options: { top?: number; skip?: number; connectorToken?: string } = {}
): Promise<GraphMessage[]> {
  const token = await getAccessToken(options.connectorToken);
  const top = options.top ?? 50;
  const skip = options.skip ?? 0;
  const select = [
    "id",
    "conversationId",
    "subject",
    "bodyPreview",
    "receivedDateTime",
    "isRead",
    "hasAttachments",
    "from",
    "toRecipients",
    "body",
  ].join(",");

  const path = `/users/${encodeURIComponent(mailboxAddress)}/mailFolders/inbox/messages?$top=${top}&$skip=${skip}&$select=${select}&$orderby=receivedDateTime desc`;
  const data = await graphGet<{ value: GraphMessage[] }>(path, token);
  return data.value;
}

/**
 * Fetch attachment metadata for a message.
 */
export async function fetchMessageAttachments(
  mailboxAddress: string,
  messageId: string,
  connectorToken?: string
): Promise<GraphAttachment[]> {
  const token = await getAccessToken(connectorToken);
  const path = `/users/${encodeURIComponent(mailboxAddress)}/messages/${messageId}/attachments?$select=id,name,contentType,size`;
  const data = await graphGet<{ value: GraphAttachment[] }>(path, token);
  return data.value;
}

/**
 * Test connectivity by reading the mailbox profile.
 */
export async function testMailboxAccess(
  mailboxAddress: string,
  connectorToken?: string
): Promise<boolean> {
  try {
    const token = await getAccessToken(connectorToken);
    await graphGet(`/users/${encodeURIComponent(mailboxAddress)}`, token);
    return true;
  } catch {
    return false;
  }
}

/**
 * Returns true if Graph credentials are configured (any method).
 */
export function isGraphConfigured(): boolean {
  const { MICROSOFT_TENANT_ID, MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET } =
    process.env;
  return !!(MICROSOFT_TENANT_ID && MICROSOFT_CLIENT_ID && MICROSOFT_CLIENT_SECRET);
}
