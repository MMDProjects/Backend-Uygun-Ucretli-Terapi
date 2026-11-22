import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Channel, ContactLifecycle, ContactType } from '@prisma/client';
import { splitMulti } from '../contact-filter';

const toOptionalBoolean = ({ value }: { value: unknown }) => {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
};

export class ContactFilterDto {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => splitMulti(value))
  @IsArray()
  @IsEnum(ContactLifecycle, { each: true })
  lifecycleStatus?: ContactLifecycle[];

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => splitMulti(value))
  @IsArray()
  @IsUUID('all', { each: true })
  tagIds?: string[];

  @IsOptional()
  @IsEnum(Channel)
  channel?: Channel;

  // Varsayılan DANISAN; açıkça başka tür istenirse o kullanılır.
  @IsOptional()
  @IsEnum(ContactType)
  contactType?: ContactType;

  @IsOptional()
  @Transform(toOptionalBoolean)
  @IsBoolean()
  hasPhone?: boolean;

  @IsOptional()
  @IsISO8601()
  lastActiveFrom?: string;

  @IsOptional()
  @IsISO8601()
  lastActiveTo?: string;

  @IsOptional()
  @IsUUID()
  listId?: string;
}

export class ListContactsQueryDto extends ContactFilterDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
