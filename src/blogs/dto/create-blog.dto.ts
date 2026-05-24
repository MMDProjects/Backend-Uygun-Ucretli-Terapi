import { IsString, MinLength } from 'class-validator';

export class CreateBlogDto {
  @IsString()
  @MinLength(5)
  title: string;

  @IsString()
  slug: string;

  @IsString()
  @MinLength(100)
  content: string;
}
