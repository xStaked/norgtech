import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { CreateKnowledgeArticleDto } from './dto/create-knowledge-article.dto';
import { ListKnowledgeArticlesQueryDto } from './dto/list-knowledge-articles-query.dto';
import { SearchKnowledgeDto } from './dto/search-knowledge.dto';
import { UpdateKnowledgeArticleDto } from './dto/update-knowledge-article.dto';
import { KnowledgeService } from './knowledge.service';

@ApiTags('Knowledge')
@ApiBearerAuth()
@Controller('knowledge')
@Roles('admin', 'asesor_tecnico', 'asesor_comercial')
export class KnowledgeController {
  constructor(private readonly knowledgeService: KnowledgeService) {}

  @Get()
  @ApiOperation({ summary: 'Listar artículos técnicos con filtros' })
  @ApiQuery({ name: 'category', required: false })
  @ApiQuery({ name: 'speciesType', required: false })
  @ApiQuery({ name: 'tags', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'isPublished', required: false })
  findAll(@CurrentUser() user: AuthUser, @Query() query: ListKnowledgeArticlesQueryDto) {
    return this.knowledgeService.findAll(user, query);
  }

  @Post()
  @ApiOperation({ summary: 'Crear artículo en la base de conocimiento' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateKnowledgeArticleDto) {
    return this.knowledgeService.create(user, dto);
  }

  @Post('search')
  @ApiOperation({ summary: 'Buscar artículos técnicos por texto y filtros' })
  search(@CurrentUser() user: AuthUser, @Body() dto: SearchKnowledgeDto) {
    return this.knowledgeService.search(user, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener detalle de un artículo técnico' })
  @ApiParam({ name: 'id', description: 'ID del artículo' })
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.knowledgeService.findOne(user, id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Actualizar un artículo técnico' })
  @ApiParam({ name: 'id', description: 'ID del artículo' })
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateKnowledgeArticleDto,
  ) {
    return this.knowledgeService.update(user, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar un artículo técnico' })
  @ApiParam({ name: 'id', description: 'ID del artículo' })
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.knowledgeService.remove(user, id);
  }
}
