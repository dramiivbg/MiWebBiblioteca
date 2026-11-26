import { AuthTokens, SessionUser } from '../Biblioteca/biblioteca.models';
import { SessionKeyProvider } from './session-key';

type IntegrityAlgorithm = 'hmac' | 'fnv';

interface SealedEnvelope<T> {
  readonly v: 1;
  readonly alg: IntegrityAlgorithm;
  readonly data: T;
  readonly sig: string;
}

export function isAuthTokens(value: unknown): value is AuthTokens {
  return (
    isRecord(value) &&
    typeof value['accessToken'] === 'string' &&
    Boolean(value['accessToken']) &&
    typeof value['accessTokenExpiresAt'] === 'string'
  );
}

export function isSessionUser(value: unknown): value is SessionUser {
  return (
    isRecord(value) &&
    typeof value['id'] === 'string' &&
    typeof value['email'] === 'string' &&
    typeof value['name'] === 'string' &&
    (value['role'] === 'user' || value['role'] === 'admin')
  );
}

export class SessionIntegrity {
  private readonly keys: SessionKeyProvider;

  constructor(secret: string) {
    this.keys = new SessionKeyProvider(secret);
  }

  async seal<T>(data: T): Promise<string> {
    const payload = JSON.stringify(data) ?? '';
    const subtle = this.subtle();
    const alg: IntegrityAlgorithm = subtle ? 'hmac' : 'fnv';
    const sig = subtle ? await this.sign(payload, subtle) : fnv1a64(payload);
    const envelope: SealedEnvelope<T> = { v: 1, alg, data, sig };
    return JSON.stringify(envelope);
  }

  async open<T>(raw: string, guard: (value: unknown) => value is T): Promise<T | null> {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!isEnvelope(parsed)) return null;

      const payload = JSON.stringify(parsed.data) ?? '';
      const subtle = this.subtle();
      if (parsed.alg === 'hmac') {
        if (!subtle) return null;
        if (!constantTimeEquals(await this.sign(payload, subtle), parsed.sig)) return null;
      } else if (parsed.alg === 'fnv') {
        if (subtle || parsed.sig !== fnv1a64(payload)) return null;
      } else {
        return null;
      }

      const data: unknown = parsed.data;
      if (!guard(data)) return null;
      return data;
    } catch {
      return null;
    }
  }

  private subtle(): SubtleCrypto | null {
    const webCrypto = globalThis.crypto;
    return webCrypto && typeof webCrypto.subtle !== 'undefined' ? webCrypto.subtle : null;
  }

  private async sign(payload: string, subtle: SubtleCrypto): Promise<string> {
    const key = await this.keys.getKey(subtle);
    if (!key) throw new Error('No se pudo preparar la clave de integridad de la sesión.');
    const signature = await subtle.sign('HMAC', key, new TextEncoder().encode(payload));
    return toHex(signature);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isEnvelope(value: unknown): value is SealedEnvelope<unknown> {
  return (
    isRecord(value) &&
    value['v'] === 1 &&
    (value['alg'] === 'hmac' || value['alg'] === 'fnv') &&
    'data' in value &&
    typeof value['sig'] === 'string'
  );
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function constantTimeEquals(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

function fnv1a64(input: string): string {
  let hash = 0xcbf29ce484222325n;
  for (const byte of new TextEncoder().encode(input)) {
    hash ^= BigInt(byte);
    hash = (hash * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return hash.toString(16).padStart(16, '0');
}
