import { brand } from "@recoverai/core";
import type { ISODateString, User, UserId, UserRepository } from "@recoverai/core";
import type { User as UserRow, PrismaClient } from "@prisma/client";

function toDomain(row: UserRow): User {
  return {
    id: brand<string, "UserId">(row.id),
    email: row.email,
    passwordHash: row.passwordHash,
    merchantId: brand<string, "MerchantId">(row.merchantId),
    createdAt: row.createdAt as ISODateString,
    failedLoginAttempts: row.failedLoginAttempts,
    lockedUntil: row.lockedUntil as ISODateString | null,
  };
}

export class PrismaUserRepository implements UserRepository {
  constructor(private readonly client: PrismaClient) {}

  async findById(id: UserId): Promise<User | null> {
    const row = await this.client.user.findUnique({ where: { id } });
    return row ? toDomain(row) : null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const row = await this.client.user.findUnique({ where: { email } });
    return row ? toDomain(row) : null;
  }

  async save(user: User): Promise<void> {
    const data = {
      email: user.email,
      passwordHash: user.passwordHash,
      merchantId: user.merchantId,
      createdAt: user.createdAt,
      failedLoginAttempts: user.failedLoginAttempts,
      lockedUntil: user.lockedUntil,
    };
    await this.client.user.upsert({
      where: { id: user.id },
      create: { id: user.id, ...data },
      update: data,
    });
  }
}
