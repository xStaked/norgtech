import { PartialType } from '@nestjs/swagger';
import { CreateKnowledgeArticleDto } from './create-knowledge-article.dto';

export class UpdateKnowledgeArticleDto extends PartialType(CreateKnowledgeArticleDto) {}
