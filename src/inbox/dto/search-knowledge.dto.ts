import { IsString, Length } from 'class-validator';

export class SearchKnowledgeDto {
  @IsString()
  @Length(1, 500)
  query: string;
}
