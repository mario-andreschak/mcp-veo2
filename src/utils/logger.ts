/** Diagnostics never include provider responses, request payloads, keys or URLs. */
export const log = {
  info: (message: string) => console.error(message),
  error: (message: string) => console.error(message),
};
