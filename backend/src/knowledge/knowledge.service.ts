import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthUser } from '../common/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { CreateKnowledgeArticleDto } from './dto/create-knowledge-article.dto';
import { ListKnowledgeArticlesQueryDto } from './dto/list-knowledge-articles-query.dto';
import { SearchKnowledgeDto } from './dto/search-knowledge.dto';
import { UpdateKnowledgeArticleDto } from './dto/update-knowledge-article.dto';

@Injectable()
export class KnowledgeService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(user: AuthUser, query: ListKnowledgeArticlesQueryDto) {
    const organizationId = this.requireOrganizationId(user);
    const page = query.page ?? 1;
    const limit = query.limit ?? 12;
    const skip = (page - 1) * limit;
    const where = this.buildWhere({
      organizationId,
      category: query.category,
      speciesType: query.speciesType,
      tags: this.parseTags(query.tags),
      search: query.search,
      isPublished:
        query.isPublished !== undefined ? query.isPublished === 'true' : undefined,
    });

    const [items, total] = await this.prisma.$transaction([
      this.prisma.knowledgeArticle.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ isPublished: 'desc' }, { updatedAt: 'desc' }, { createdAt: 'desc' }],
      }),
      this.prisma.knowledgeArticle.count({ where }),
    ]);

    return {
      items: await this.attachAuthors(items),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async search(user: AuthUser, dto: SearchKnowledgeDto) {
    const organizationId = this.requireOrganizationId(user);
    const where = this.buildWhere({
      organizationId,
      category: dto.category,
      speciesType: dto.speciesType,
      tags: dto.tags,
      search: dto.query,
      isPublished: dto.publishedOnly ? true : undefined,
    });

    const items = await this.prisma.knowledgeArticle.findMany({
      where,
      take: 20,
      orderBy: [{ isPublished: 'desc' }, { updatedAt: 'desc' }],
    });

    return {
      items: await this.attachAuthors(items),
      meta: {
        total: items.length,
        query: dto.query,
      },
    };
  }

  async create(user: AuthUser, dto: CreateKnowledgeArticleDto) {
    const organizationId = this.requireOrganizationId(user);
    const article = await this.prisma.knowledgeArticle.create({
      data: {
        organizationId,
        title: dto.title.trim(),
        content: dto.content.trim(),
        category: dto.category.trim().toLowerCase(),
        speciesType: dto.speciesType ?? 'both',
        tags: this.normalizeTags(dto.tags),
        isPublished: dto.isPublished ?? false,
        createdBy: user.id,
      },
    });

    return this.attachAuthor(article);
  }

  async findOne(user: AuthUser, id: string) {
    const organizationId = this.requireOrganizationId(user);
    const article = await this.prisma.knowledgeArticle.findFirst({
      where: {
        id,
        organizationId,
      },
    });

    if (!article) {
      throw new NotFoundException('Artículo no encontrado');
    }

    return this.attachAuthor(article);
  }

  async update(user: AuthUser, id: string, dto: UpdateKnowledgeArticleDto) {
    const organizationId = this.requireOrganizationId(user);
    await this.ensureArticleBelongsToOrganization(id, organizationId);

    const article = await this.prisma.knowledgeArticle.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
        ...(dto.content !== undefined ? { content: dto.content.trim() } : {}),
        ...(dto.category !== undefined ? { category: dto.category.trim().toLowerCase() } : {}),
        ...(dto.speciesType !== undefined ? { speciesType: dto.speciesType } : {}),
        ...(dto.tags !== undefined ? { tags: this.normalizeTags(dto.tags) } : {}),
        ...(dto.isPublished !== undefined ? { isPublished: dto.isPublished } : {}),
      },
    });

    return this.attachAuthor(article);
  }

  async remove(user: AuthUser, id: string) {
    const organizationId = this.requireOrganizationId(user);
    await this.ensureArticleBelongsToOrganization(id, organizationId);

    await this.prisma.knowledgeArticle.delete({
      where: { id },
    });

    return {
      success: true,
      id,
    };
  }

  private buildWhere(input: {
    organizationId: string;
    category?: string;
    speciesType?: string;
    tags?: string[];
    search?: string;
    isPublished?: boolean;
  }): Prisma.KnowledgeArticleWhereInput {
    const search = input.search?.trim();
    const tags = this.normalizeTags(input.tags);

    return {
      organizationId: input.organizationId,
      ...(input.category ? { category: input.category.trim().toLowerCase() } : {}),
      ...(input.speciesType ? { speciesType: input.speciesType.trim().toLowerCase() } : {}),
      ...(input.isPublished !== undefined ? { isPublished: input.isPublished } : {}),
      ...(tags.length > 0 ? { tags: { hasSome: tags } } : {}),
      ...(search
        ? {
            OR: [
              { title: { contains: search, mode: 'insensitive' } },
              { content: { contains: search, mode: 'insensitive' } },
              { category: { contains: search, mode: 'insensitive' } },
              { tags: { has: search.toLowerCase() } },
            ],
          }
        : {}),
    };
  }

  private async ensureArticleBelongsToOrganization(id: string, organizationId: string) {
    const article = await this.prisma.knowledgeArticle.findFirst({
      where: {
        id,
        organizationId,
      },
    });

    if (!article) {
      throw new NotFoundException('Artículo no encontrado');
    }

    return article;
  }

  private normalizeTags(tags?: string[]) {
    return Array.from(
      new Set(
        (tags ?? [])
          .map((tag) => tag.trim().toLowerCase())
          .filter((tag) => tag.length > 0),
      ),
    );
  }

  private parseTags(raw?: string) {
    if (!raw) {
      return [];
    }

    return raw
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean);
  }

  private async attachAuthors<
    T extends Array<{ createdBy: string; [key: string]: unknown }>,
  >(articles: T) {
    const profiles = await this.loadProfiles(articles.map((article) => article.createdBy));
    return articles.map((article) => this.serializeArticle(article, profiles));
  }

  private async attachAuthor<T extends { createdBy: string; [key: string]: unknown }>(
    article: T,
  ) {
    const profiles = await this.loadProfiles([article.createdBy]);
    return this.serializeArticle(article, profiles);
  }

  private async loadProfiles(profileIds: string[]) {
    const uniqueIds = Array.from(new Set(profileIds.filter(Boolean)));

    if (uniqueIds.length === 0) {
      return new Map<string, { id: string; fullName: string | null; email: string | null }>();
    }

    const profiles = await this.prisma.profile.findMany({
      where: {
        id: {
          in: uniqueIds,
        },
      },
      select: {
        id: true,
        fullName: true,
        email: true,
      },
    });

    return new Map(profiles.map((profile) => [profile.id, profile]));
  }

  private serializeArticle<T extends { createdBy: string; [key: string]: unknown }>(
    article: T,
    profiles: Map<string, { id: string; fullName: string | null; email: string | null }>,
  ) {
    return {
      ...article,
      author: profiles.get(article.createdBy) ?? null,
    };
  }

  private requireOrganizationId(user: AuthUser) {
    if (!user.organizationId) {
      throw new ForbiddenException('El usuario no tiene organización asociada.');
    }

    return user.organizationId;
  }
}
