import { Transform, Type } from 'class-transformer';
import {
  IsEmail, IsInt, IsOptional, IsString, Length, Matches, Max, MaxLength, Min, Validate, ValidateNested,
  ValidatorConstraint, ValidatorConstraintInterface,
} from 'class-validator';
import { normalizeEmail, trimText } from '../../common/tokens';
import { isValidCuit } from './validation';

/** Texto opcional: recorta espacios y guarda null si queda vacío. */
const optionalText = ({ value }: { value: unknown }) => {
  const trimmed = trimText(value);
  return trimmed === '' ? null : trimmed;
};

@ValidatorConstraint({ name: 'cuit' })
class CuitConstraint implements ValidatorConstraintInterface {
  validate(value: unknown) { return value === null || (typeof value === 'string' && isValidCuit(value)); }
  defaultMessage() { return 'Ingresá un CUIT válido de 11 dígitos.'; }
}

export class NumberingDto {
  // Prefijo opcional en mayúsculas, por ejemplo «OT-» o «PRE-».
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @IsString({ message: 'Ingresá un prefijo.' })
  @Matches(/^[A-Z0-9-]{0,10}$/, { message: 'El prefijo admite hasta 10 letras, números o guiones.' })
  prefix!: string;

  @IsInt({ message: 'El próximo número debe ser un entero.' })
  @Min(1, { message: 'El próximo número debe ser 1 o mayor.' })
  @Max(999_999_999, { message: 'El próximo número es demasiado grande.' })
  next!: number;
}

export class NumberingSettingsDto {
  @ValidateNested() @Type(() => NumberingDto)
  workOrder!: NumberingDto;

  @ValidateNested() @Type(() => NumberingDto)
  estimate!: NumberingDto;
}

/** Reemplazo completo de la configuración comercial (PUT). */
export class UpdateWorkshopSettingsDto {
  @Transform(({ value }: { value: unknown }) => trimText(value))
  @IsString({ message: 'Ingresá el nombre comercial.' })
  @Length(2, 160, { message: 'El nombre comercial debe tener entre 2 y 160 caracteres.' })
  workshopName!: string;

  // Acepta «20-12345678-6» o «20123456786»; se guardan solo los dígitos.
  @Transform(({ value }: { value: unknown }) => {
    if (value === null || value === undefined) return null;
    if (typeof value !== 'string') return value;
    const digits = value.replace(/[\s-]/g, '');
    return digits === '' ? null : digits;
  })
  @IsOptional()
  @Validate(CuitConstraint)
  taxId!: string | null;

  @Transform(optionalText) @IsOptional()
  @IsString({ message: 'Ingresá el domicilio.' }) @MaxLength(300, { message: 'El domicilio admite hasta 300 caracteres.' })
  address!: string | null;

  @Transform(optionalText) @IsOptional()
  @IsString({ message: 'Ingresá la localidad.' }) @MaxLength(120, { message: 'La localidad admite hasta 120 caracteres.' })
  locality!: string | null;

  @Transform(optionalText) @IsOptional()
  @IsString({ message: 'Ingresá el teléfono.' }) @MaxLength(40, { message: 'El teléfono admite hasta 40 caracteres.' })
  contactPhone!: string | null;

  @Transform(({ value }: { value: unknown }) => { const email = normalizeEmail(value); return email === '' ? null : email; })
  @IsOptional()
  @MaxLength(254, { message: 'Ingresá un email válido.' }) @IsEmail({}, { message: 'Ingresá un email válido.' })
  contactEmail!: string | null;

  @Transform(optionalText) @IsOptional()
  @IsString({ message: 'Ingresá el texto para documentos.' })
  @MaxLength(1000, { message: 'El texto para documentos admite hasta 1000 caracteres.' })
  documentFooter!: string | null;

  @IsInt({ message: 'La vigencia debe ser un número entero de días.' })
  @Min(1, { message: 'La vigencia debe ser de 1 a 365 días.' })
  @Max(365, { message: 'La vigencia debe ser de 1 a 365 días.' })
  quoteValidityDays!: number;

  @Transform(optionalText) @IsOptional()
  @IsString({ message: 'Ingresá las condiciones.' })
  @MaxLength(2000, { message: 'Las condiciones admiten hasta 2000 caracteres.' })
  defaultTerms!: string | null;

  @ValidateNested() @Type(() => NumberingSettingsDto)
  numbering!: NumberingSettingsDto;
}
