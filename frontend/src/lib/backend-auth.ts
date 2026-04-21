export function buildBackendAuthHeaders(userId: string): Record<string, string> {
  return { "x-supoclip-user-id": userId };
}
