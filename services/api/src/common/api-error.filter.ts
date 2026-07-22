import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';

@Catch()
export class ApiErrorFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const request = host.switchToHttp().getRequest<Request>();
    const requestId = typeof request.headers['x-request-id'] === 'string' ? request.headers['x-request-id'] : randomUUID();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();
      const normalized = this.normalize(payload, status, requestId);
      response.status(status).json(normalized);
      return;
    }

    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
        requestId,
      },
    });
  }

  private normalize(payload: string | object, status: number, requestId: string) {
    if (typeof payload === 'string') {
      return { error: { code: this.defaultCode(status), message: payload, requestId } };
    }
    if (typeof payload === 'object' && payload !== null && 'code' in payload && 'message' in payload) {
      const record = payload as { code: string; message: string; details?: unknown };
      return { error: { code: record.code, message: record.message, ...(record.details !== undefined ? { details: record.details } : {}), requestId } };
    }
    if (typeof payload === 'object' && payload !== null && 'message' in payload) {
      const record = payload as { message: string | string[]; error?: string; statusCode?: number };
      const message = Array.isArray(record.message) ? record.message.join('; ') : record.message;
      return { error: { code: this.defaultCode(status), message, requestId } };
    }
    return { error: { code: this.defaultCode(status), message: 'Request failed', requestId } };
  }

  private defaultCode(status: number): string {
    if (status === 400) return 'BAD_REQUEST';
    if (status === 401) return 'UNAUTHORIZED';
    if (status === 403) return 'FORBIDDEN';
    if (status === 404) return 'NOT_FOUND';
    if (status === 409) return 'CONFLICT';
    if (status === 413) return 'UPLOAD_TOO_LARGE';
    if (status === 422) return 'UNPROCESSABLE';
    if (status === 429) return 'RATE_LIMITED';
    if (status === 503) return 'UNAVAILABLE';
    return 'REQUEST_FAILED';
  }
}
