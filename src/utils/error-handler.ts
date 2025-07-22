export function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function createErrorMessage(context: string, error: unknown): string {
  return `${context}: ${formatError(error)}`;
}

export function safeAsyncOperation<T>(
  operation: () => Promise<T>,
  context: string
): Promise<T> {
  return operation().catch((error) => {
    throw new Error(createErrorMessage(context, error));
  });
}
