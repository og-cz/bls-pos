import type { ContentfulStatusCode } from 'hono/utils/http-status';

export type ErrorBody = {
  error: { code: string; message: string; fields?: Record<string, string> };
};

/** Thrown from handlers and services; turned into `{ error: { code, message } }` by app.onError. */
export class ApiError extends Error {
  constructor(
    readonly status: ContentfulStatusCode,
    readonly code: string,
    message: string,
    readonly fields?: Record<string, string>,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  toBody(): ErrorBody {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.fields ? { fields: this.fields } : {}),
      },
    };
  }
}
