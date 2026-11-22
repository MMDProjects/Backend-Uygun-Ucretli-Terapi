import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { ContactLifecycle, ContactType } from '@prisma/client';

export class UpdateContactDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  fullName?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(120)
  age?: number;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  notes?: string;

  // Uzman/ekip işaretleri konuşma durumunu değiştirmez.
  @ValidateIf((_, v) => v !== undefined)
  @IsEnum(ContactType)
  contactType?: ContactType;

  @ValidateIf((_, v) => v !== undefined)
  @IsEnum(ContactLifecycle)
  lifecycleStatus?: ContactLifecycle;

  // Gönderilirse kişinin etiketleri tamamen bu listeyle değişir.
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  tagIds?: string[];
}
