import 'server-only';

export type TranslationErrorCode = 'bad_input' | 'quota' | 'unavailable' | 'conflict' | 'not_found';

export class TranslationError extends Error {
  constructor(public readonly code: TranslationErrorCode, message: string) {
    super(message);
    this.name = 'TranslationError';
  }
}

export function translationErrorStatus(error: unknown) {
  if (!(error instanceof TranslationError)) return 500;
  return { bad_input: 400, quota: 429, unavailable: 503, conflict: 409, not_found: 404 }[error.code];
}
