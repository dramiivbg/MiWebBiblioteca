import { HttpErrorResponse } from '@angular/common/http';

export function bibliotecaErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof HttpErrorResponse) {
    const body: unknown = error.error;
    if (typeof body === 'object' && body !== null && 'detail' in body) {
      const detail = body.detail;
      if (typeof detail === 'string' && detail.trim()) return detail;
    }
    if (typeof body === 'string' && body.trim()) return body;
    if (error.status === 0) {
      return 'No hay conexión con la API. Comprueba que el servicio esté disponible y permita CORS.';
    }
    return `${fallback} (HTTP ${error.status})`;
  }
  return error instanceof Error ? error.message : fallback;
}
