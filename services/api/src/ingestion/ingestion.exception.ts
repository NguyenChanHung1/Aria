import { HttpException, HttpStatus } from '@nestjs/common';

export class IngestionException extends HttpException {
  constructor(
    public readonly code: string,
    message: string,
    status: HttpStatus = HttpStatus.BAD_REQUEST,
    details?: Record<string, unknown>,
  ) {
    super(
      {
        statusCode: status,
        error: status === HttpStatus.PAYLOAD_TOO_LARGE ? 'Payload Too Large' : 'Bad Request',
        code,
        message,
        ...(details ? { details } : {}),
      },
      status,
    );
  }
}
