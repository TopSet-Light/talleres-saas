import { BadRequestException, ValidationError, ValidationPipe } from '@nestjs/common';

function collect(errors: ValidationError[], fields: Record<string, string>, prefix = '') {
  for (const error of errors) {
    const field = prefix + error.property;
    const message = Object.values(error.constraints ?? {})[0];
    if (message && !fields[field]) fields[field] = message;
    if (error.children?.length) collect(error.children, fields, `${field}.`);
  }
}

// Respuesta 400 consistente: mensaje general y un mensaje por campo, sin eco de los valores.
export function createValidationPipe() {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    validationError: { target: false, value: false },
    exceptionFactory: errors => {
      const fields: Record<string, string> = {};
      collect(errors, fields);
      return new BadRequestException({
        statusCode: 400, code: 'VALIDATION_ERROR', message: 'Revisá los datos ingresados.', fields,
      });
    },
  });
}
