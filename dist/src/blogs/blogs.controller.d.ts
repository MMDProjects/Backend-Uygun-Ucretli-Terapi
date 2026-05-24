import { BlogsService } from './blogs.service';
import { CreateBlogDto } from './dto/create-blog.dto';
import type { User } from '@prisma/client';
export declare class BlogsController {
    private readonly blogsService;
    constructor(blogsService: BlogsService);
    findAll(page?: string, limit?: string): Promise<{
        data: {
            id: string;
            createdAt: Date;
            expertProfile: {
                user: {
                    firstName: string;
                    lastName: string;
                };
                title: string;
            };
            title: string;
            slug: string;
        }[];
        total: number;
        page: number;
        limit: number;
    }>;
    findBySlug(slug: string): Promise<{
        expertProfile: {
            id: string;
            user: {
                firstName: string;
                lastName: string;
            };
            title: string;
            avatarUrl: string;
        };
    } & {
        id: string;
        createdAt: Date;
        updatedAt: Date;
        title: string;
        status: import("@prisma/client").$Enums.ApprovalStatus;
        adminNote: string | null;
        content: string;
        expertProfileId: string;
        slug: string;
    }>;
    getMyBlogs(user: User): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        title: string;
        status: import("@prisma/client").$Enums.ApprovalStatus;
        adminNote: string | null;
        content: string;
        expertProfileId: string;
        slug: string;
    }[]>;
    create(user: User, dto: CreateBlogDto): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        title: string;
        status: import("@prisma/client").$Enums.ApprovalStatus;
        adminNote: string | null;
        content: string;
        expertProfileId: string;
        slug: string;
    }>;
    update(user: User, id: string, dto: Partial<CreateBlogDto>): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        title: string;
        status: import("@prisma/client").$Enums.ApprovalStatus;
        adminNote: string | null;
        content: string;
        expertProfileId: string;
        slug: string;
    }>;
    delete(user: User, id: string): Promise<{
        message: string;
    }>;
}
