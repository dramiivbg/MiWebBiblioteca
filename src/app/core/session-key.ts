const DATABASE_NAME = 'biblioteca-session-security';
const STORE_NAME = 'keys';
const KEY_ID = 'integrity-key';

export class SessionKeyProvider {
  private cached: Promise<CryptoKey | null> | null = null;

  constructor(private readonly fallbackSecret: string) {}

  getKey(subtle: SubtleCrypto): Promise<CryptoKey | null> {
    this.cached ??= this.resolveKey(subtle);
    return this.cached;
  }

  private async resolveKey(subtle: SubtleCrypto): Promise<CryptoKey | null> {
    const database = globalThis.indexedDB;
    if (!database) return this.fallbackKey(subtle);

    try {
      const stored = await this.read(database);
      if (stored) return stored;
      const generated = await subtle.generateKey(
        { name: 'HMAC', hash: 'SHA-256', length: 256 },
        false,
        ['sign'],
      );
      await this.write(database, generated);
      return generated;
    } catch {
      return this.fallbackKey(subtle);
    }
  }

  private fallbackKey(subtle: SubtleCrypto): Promise<CryptoKey> {
    return subtle.importKey(
      'raw',
      new TextEncoder().encode(this.fallbackSecret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
  }

  private read(database: IDBFactory): Promise<CryptoKey | null> {
    return this.withDatabase(database, 'readonly', (store) =>
      new Promise<CryptoKey | null>((resolve, reject) => {
        const request = store.get(KEY_ID);
        request.onsuccess = () => resolve((request.result as CryptoKey | undefined) ?? null);
        request.onerror = () => reject(request.error);
      }),
    );
  }

  private write(database: IDBFactory, key: CryptoKey): Promise<void> {
    return this.withDatabase(database, 'readwrite', (store) =>
      new Promise<void>((resolve, reject) => {
        const request = store.put(key, KEY_ID);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      }),
    );
  }

  private async withDatabase<T>(
    factory: IDBFactory,
    mode: IDBTransactionMode,
    operation: (store: IDBObjectStore) => Promise<T>,
  ): Promise<T> {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = factory.open(DATABASE_NAME, 1);
      request.onupgradeneeded = () => {
        const opened = request.result;
        if (!opened.objectStoreNames.contains(STORE_NAME)) {
          opened.createObjectStore(STORE_NAME);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    try {
      const store = database.transaction(STORE_NAME, mode).objectStore(STORE_NAME);
      return await operation(store);
    } finally {
      database.close();
    }
  }
}
