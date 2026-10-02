import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DeepSeekClient,
  DeepSeekClientError,
} from '../src/background/deepseek.ts';

function createClient(timeout = 1_000): DeepSeekClient {
  return new DeepSeekClient({
    apiKey: 'test-key-not-a-real-secret',
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-chat',
    temperature: 0.2,
    timeout,
  });
}

async function withMockFetch(
  mock: typeof fetch,
  run: () => Promise<void>,
): Promise<void> {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mock;
  try {
    await run();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test('translateBatch requests JSON mode and returns raw assistant content', async () => {
  await withMockFetch(
    (async (_input, init) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      assert.equal(init?.redirect, 'error');
      assert.equal(init?.credentials, 'omit');
      assert.deepEqual(body.response_format, { type: 'json_object' });
      assert.deepEqual(body.thinking, { type: 'disabled' });
      assert.equal(String(init?.headers).includes('test-key'), false);
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content:
                  '{"translations":[{"id":"a","translation":"甲"}]}',
              },
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }) as typeof fetch,
    async () => {
      const result = await createClient().translateBatch({
        systemPrompt: 'Translate.',
        userPrompt: '{"items":[]}',
      });
      assert.match(result, /translations/);
    },
  );
});

test('rejects insecure, third-party and credential-bearing endpoints before fetch', async () => {
  await withMockFetch((async () => { assert.fail('fetch must not run'); }) as typeof fetch, async () => {
    const credentialsUrl = new URL('https://api.deepseek.com');
    credentialsUrl.username = 'dummy-user';
    credentialsUrl.password = 'dummy-password';
    for (const baseUrl of ['http://api.deepseek.com', 'https://attacker.example', 'https://api.deepseek.com.attacker.example', credentialsUrl.href]) {
      const client = new DeepSeekClient({ apiKey: 'dummy', baseUrl, model: 'test', temperature: 0.2, timeout: 1000 });
      await assert.rejects(client.testConnection(), (error: unknown) => error instanceof DeepSeekClientError && error.code === 'INVALID_CONFIGURATION');
    }
  });
});

test('connection test disables thinking and leaves enough room for final OK content', async () => {
  await withMockFetch(
    (async (_input, init) => {
      const body = JSON.parse(String(init?.body)) as {
        thinking?: unknown;
        max_tokens?: number;
      };
      assert.deepEqual(body.thinking, { type: 'disabled' });
      assert.equal(body.max_tokens, 16);
      return new Response(
        JSON.stringify({ choices: [{ message: { content: 'OK' } }] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }) as typeof fetch,
    async () => createClient().testConnection(),
  );
});

test('maps 401, 429, and 500 without exposing response bodies', async () => {
  const cases = [
    { status: 401, code: 'AUTHENTICATION' },
    { status: 429, code: 'RATE_LIMIT' },
    { status: 500, code: 'SERVICE_UNAVAILABLE' },
    { status: 503, code: 'SERVICE_UNAVAILABLE' },
  ] as const;

  for (const item of cases) {
    await withMockFetch(
      (async () =>
        new Response('sensitive provider details', { status: item.status })) as typeof fetch,
      async () => {
        await assert.rejects(
          createClient().translateBatch({
            systemPrompt: 'Translate.',
            userPrompt: '{"items":[]}',
          }),
          (error: unknown) =>
            error instanceof DeepSeekClientError && error.code === item.code,
        );
      },
    );
  }
});

test('network failures become a safe NETWORK error', async () => {
  await withMockFetch(
    (async () => {
      throw new TypeError('provider host details');
    }) as typeof fetch,
    async () => {
      await assert.rejects(
        createClient().translateBatch({
          systemPrompt: 'Translate.',
          userPrompt: '{"items":[]}',
        }),
        (error: unknown) =>
          error instanceof DeepSeekClientError &&
          error.code === 'NETWORK' &&
          error.message === '无法连接 DeepSeek API',
      );
    },
  );
});

test('AbortController converts a timed-out request into TIMEOUT', async () => {
  await withMockFetch(
    ((_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('Aborted', 'AbortError'));
        });
      })) as typeof fetch,
    async () => {
      await assert.rejects(
        createClient(1).translateBatch({
          systemPrompt: 'Translate.',
          userPrompt: '{"items":[]}',
        }),
        (error: unknown) =>
          error instanceof DeepSeekClientError && error.code === 'TIMEOUT',
      );
    },
  );
});

test('external task cancellation is distinct from timeout and is not retryable', async () => {
  await withMockFetch(
    ((_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('Aborted', 'AbortError'));
        });
      })) as typeof fetch,
    async () => {
      const controller = new AbortController();
      const request = createClient(10_000).translateBatch({
        systemPrompt: 'Translate.',
        userPrompt: '{"items":[]}',
        signal: controller.signal,
      });
      controller.abort();
      await assert.rejects(
        request,
        (error: unknown) =>
          error instanceof DeepSeekClientError && error.code === 'CANCELLED',
      );
    },
  );
});
