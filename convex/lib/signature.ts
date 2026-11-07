/**
 * HMAC-SHA256 request signing, used in both directions between Convex and n8n.
 *
 *   X-LendLoop-Signature: t=<unix seconds>,v1=<hex hmac>
 *   signed string:        <t>.<METHOD>.<path>.<raw body>
 *
 * The timestamp limits replay; method and path stop a signature for one endpoint being reused on
 * another. The n8n Code nodes implement the same scheme, and tests/n8n-workflows.test.ts runs
 * those exported nodes against this module to keep the two in step.
 */

export const SIGNATURE_HEADER = "X-LendLoop-Signature";
export const SIGNATURE_TOLERANCE_SECONDS = 300;

const encoder = new TextEncoder();

function importKey(secret: string, usage: "sign" | "verify") {
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    usage,
  ]);
}

function signedString(timestamp: number, method: string, path: string, body: string) {
  return encoder.encode(`${timestamp}.${method.toUpperCase()}.${path}.${body}`);
}

function hexToBytes(hex: string): Uint8Array<ArrayBuffer> | null {
  if (hex.length !== 64 || !/^[0-9a-f]+$/i.test(hex)) return null;
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

export async function signRequest(args: {
  secret: string;
  method: string;
  path: string;
  body: string;
  nowMs: number;
}): Promise<string> {
  const timestamp = Math.floor(args.nowMs / 1000);
  const key = await importKey(args.secret, "sign");
  const mac = await crypto.subtle.sign("HMAC", key, signedString(timestamp, args.method, args.path, args.body));
  const hex = Array.from(new Uint8Array(mac), (b) => b.toString(16).padStart(2, "0")).join("");
  return `t=${timestamp},v1=${hex}`;
}

export async function verifyRequest(args: {
  secret: string;
  header: string | null;
  method: string;
  path: string;
  body: string;
  nowMs: number;
}): Promise<boolean> {
  const match = args.header?.match(/^t=(\d{1,12}),v1=([0-9a-fA-F]{64})$/);
  if (!match) return false;
  const timestamp = Number(match[1]);
  if (Math.abs(args.nowMs / 1000 - timestamp) > SIGNATURE_TOLERANCE_SECONDS) return false;
  const mac = hexToBytes(match[2]);
  if (!mac) return false;
  const key = await importKey(args.secret, "verify");
  // subtle.verify compares in constant time.
  return crypto.subtle.verify("HMAC", key, mac, signedString(timestamp, args.method, args.path, args.body));
}
