import { brand } from "@recoverai/core";
import type { ISODateString, Merchant, MerchantId, MerchantRepository } from "@recoverai/core";
import type { Merchant as MerchantRow, PrismaClient } from "@prisma/client";
import { decodeMetadata, encodeMetadata } from "./mappers.js";

function toDomain(row: MerchantRow): Merchant {
  return {
    id: brand<string, "MerchantId">(row.id),
    name: row.name,
    email: row.email,
    websiteUrl: row.websiteUrl ?? undefined,
    defaultCurrency: row.defaultCurrency,
    createdAt: row.createdAt as ISODateString,
    metadata: decodeMetadata(row.metadata),
  };
}

export class PrismaMerchantRepository implements MerchantRepository {
  constructor(private readonly client: PrismaClient) {}

  async findById(id: MerchantId): Promise<Merchant | null> {
    const row = await this.client.merchant.findUnique({ where: { id } });
    return row ? toDomain(row) : null;
  }

  async save(merchant: Merchant): Promise<void> {
    const data = {
      name: merchant.name,
      email: merchant.email,
      websiteUrl: merchant.websiteUrl ?? null,
      defaultCurrency: merchant.defaultCurrency,
      createdAt: merchant.createdAt,
      metadata: encodeMetadata(merchant.metadata),
    };
    await this.client.merchant.upsert({
      where: { id: merchant.id },
      create: { id: merchant.id, ...data },
      update: data,
    });
  }
}
