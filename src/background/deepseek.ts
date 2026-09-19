export interface DeepSeekClientOptions {
  apiKey: string;
  baseUrl: string;
  model: string;
  temperature: number;
  timeout: number;
}

export interface DeepSeekTranslateRequest {
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
  signal?: AbortSignal;
}

export type DeepSeekBatchRequest = DeepSeekTranslateRequest;

export type DeepSeekErrorCode =
  | 'MISSING_API_KEY'
  | 'AUTHENTICATION'
  | 'INSUFFICIENT_BALANCE'
  | 'INVALID_CONFIGURATION'
  | 'RATE_LIMIT'
  | 'TIMEOUT'
  | 'CANCELLED'
  | 'NETWORK'
  | 'SERVICE_UNAVAILABLE'
  | 'UNEXPECTED_RESPONSE';

export class DeepSeekClientError extends Error {
  readonly code: DeepSeekErrorCode;

  constructor(
    code: DeepSeekErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'DeepSeekClientError';
    this.code = code;
  }
}

interface ChatMessage {
  role: 'system' | 'user';
  content: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function getResponseContent(payload: unknown): string | null {
  if (!isRecord(payload) || !Array.isArray(payload.choices)) {
    return null;
  }

  const firstChoice: unknown = payload.choices[0];
  if (!isRecord(firstChoice) || !isRecord(firstChoice.message)) {
    return null;
  }

  return typeof firstChoice.message.content === 'string'
    ? firstChoice.message.content
    : null;
}

function isAbortError(error: unknown): boolean {
  return (
    error instanceof DOMException
      ? error.name === 'AbortError'
      : isRecord(error) && error.name === 'AbortError'
  );
}

function createEndpoint(baseUrl: string): string {
  let url: URL;

  try {
    url = new URL(baseUrl);
  } catch {
    throw new DeepSeekClientError(
      'INVALID_CONFIGURATION',
      'DeepSeek API 配置无效',
    );
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new DeepSeekClientError(
      'INVALID_CONFIGURATION',
      'DeepSeek API 配置无效',
    );
  }

  const path = url.pathname.replace(/\/+$/, '');
  if (!path.endsWith('/chat/completions')) {
    url.pathname = `${path}/chat/completions`;
  }
  url.search = '';
  url.hash = '';

  return url.toString();
}

function mapHttpError(status: number): DeepSeekClientError {
  if (status === 401 || status === 403) {
    return new DeepSeekClientError(
      'AUTHENTICATION',
      'API Key 无效或无权限',
    );
  }

  if (status === 402) {
    return new DeepSeekClientError(
      'INSUFFICIENT_BALANCE',
      'DeepSeek API 余额不足',
    );
  }

  if (status === 429) {
    return new DeepSeekClientError(
      'RATE_LIMIT',
      '请求过于频繁或 API 配额受限',
    );
  }

  if (status >= 500) {
    return new DeepSeekClientError(
      'SERVICE_UNAVAILABLE',
      'DeepSeek 服务暂时不可用',
    );
  }

  return new DeepSeekClientError(
    'INVALID_CONFIGURATION',
    'DeepSeek 请求配置无效',
  );
}

export class DeepSeekClient {
  private readonly options: DeepSeekClientOptions;

  constructor(options: DeepSeekClientOptions) {
    this.options = options;
  }

  async testConnection(): Promise<void> {
    const content = await this.request(
      [{ role: 'user', content: 'Return exactly: OK' }],
      16,
    );

    if (!content.trim()) {
      throw new DeepSeekClientError(
        'UNEXPECTED_RESPONSE',
        'DeepSeek API 返回异常',
      );
    }
  }

  async translate(request: DeepSeekTranslateRequest): Promise<string> {
    return this.request(
      [
        { role: 'system', content: request.systemPrompt },
        { role: 'user', content: request.userPrompt },
      ],
      request.maxTokens,
      false,
      request.signal,
    );
  }

  async translateBatch(request: DeepSeekBatchRequest): Promise<string> {
    return this.request(
      [
        { role: 'system', content: request.systemPrompt },
        { role: 'user', content: request.userPrompt },
      ],
      request.maxTokens,
      true,
      request.signal,
    );
  }

  private async request(
    messages: ChatMessage[],
    maxTokens?: number,
    jsonResponse = false,
    externalSignal?: AbortSignal,
  ): Promise<string> {
    if (!this.options.apiKey.trim()) {
      throw new DeepSeekClientError(
        'MISSING_API_KEY',
        '请先填写 DeepSeek API Key',
      );
    }

    if (
      !this.options.model.trim() ||
      !Number.isFinite(this.options.temperature) ||
      this.options.temperature < 0 ||
      this.options.temperature > 2 ||
      !Number.isFinite(this.options.timeout) ||
      this.options.timeout <= 0
    ) {
      throw new DeepSeekClientError(
        'INVALID_CONFIGURATION',
        'DeepSeek API 配置无效',
      );
    }

    const controller = new AbortController();
    let cancelledByCaller = externalSignal?.aborted ?? false;
    const cancelFromCaller = (): void => {
      cancelledByCaller = true;
      controller.abort();
    };
    if (externalSignal?.aborted) {
      controller.abort();
    } else {
      externalSignal?.addEventListener('abort', cancelFromCaller, {
        once: true,
      });
    }
    const timeoutId = globalThis.setTimeout(
      () => controller.abort(),
      this.options.timeout,
    );

    try {
      const response = await fetch(createEndpoint(this.options.baseUrl), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.options.apiKey}`,
        },
        body: JSON.stringify({
          model: this.options.model,
          messages,
          // Translation needs deterministic final text, not reasoning tokens.
          // DeepSeek Flash enables thinking by default, so disable it explicitly.
          thinking: { type: 'disabled' },
          temperature: this.options.temperature,
          ...(jsonResponse
            ? { response_format: { type: 'json_object' } }
            : {}),
          ...(maxTokens === undefined ? {} : { max_tokens: maxTokens }),
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw mapHttpError(response.status);
      }

      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        throw new DeepSeekClientError(
          'UNEXPECTED_RESPONSE',
          'DeepSeek API 返回异常',
        );
      }

      const content = getResponseContent(payload);
      if (content === null) {
        throw new DeepSeekClientError(
          'UNEXPECTED_RESPONSE',
          'DeepSeek API 返回异常',
        );
      }

      return content;
    } catch (error: unknown) {
      if (error instanceof DeepSeekClientError) {
        throw error;
      }

      if (isAbortError(error)) {
        if (cancelledByCaller) {
          throw new DeepSeekClientError(
            'CANCELLED',
            '翻译任务已取消',
          );
        }
        throw new DeepSeekClientError(
          'TIMEOUT',
          '请求超时，请稍后重试',
        );
      }

      throw new DeepSeekClientError(
        'NETWORK',
        '无法连接 DeepSeek API',
      );
    } finally {
      globalThis.clearTimeout(timeoutId);
      externalSignal?.removeEventListener('abort', cancelFromCaller);
    }
  }
}
