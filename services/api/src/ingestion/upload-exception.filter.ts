import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus } from '@nestjs/common';
import type { Response } from 'express';
import { MulterError } from 'multer';

@Catch(MulterError)
export class UploadExceptionFilter implements ExceptionFilter {
  catch(exception: MulterError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const oversized = exception.code === 'LIMIT_FILE_SIZE';
    const status = oversized ? HttpStatus.PAYLOAD_TOO_LARGE : HttpStatus.BAD_REQUEST;
    response.status(status).json({
      statusCode: status,
      error: oversized ? 'Payload Too Large' : 'Bad Request',
      code: oversized ? 'UPLOAD_TOO_LARGE' : 'INVALID_MULTIPART_UPLOAD',
      message: oversized ? 'The uploaded file exceeds the configured size limit' : 'The multipart upload is invalid',
    });
  }
}
