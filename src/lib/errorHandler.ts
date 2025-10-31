// 중앙화된 에러 처리 유틸리티

export class AppError extends Error {
  constructor(
    message: string,
    public code?: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function handleError(error: unknown, context?: string): AppError {
  const contextPrefix = context ? `[${context}] ` : '';

  if (error instanceof AppError) {
    console.error(`${contextPrefix}${error.message}`, error.details);
    return error;
  }

  if (error instanceof Error) {
    console.error(`${contextPrefix}${error.message}`, error);
    return new AppError(error.message, 'UNKNOWN_ERROR', error);
  }

  const message = String(error);
  console.error(`${contextPrefix}${message}`);
  return new AppError(message, 'UNKNOWN_ERROR', error);
}

export function logError(error: unknown, context?: string): void {
  handleError(error, context);
}

export function showErrorToUser(error: unknown, context?: string): void {
  const appError = handleError(error, context);
  // TODO: 나중에 토스트 알림이나 모달로 사용자에게 표시
  console.error('User-facing error:', appError.message);
}
