import { brand } from "@recoverai/core";
import type { Customer, CustomerId, CustomerRepository, ISODateString } from "@recoverai/core";
import type { Customer as CustomerRow, PrismaClient } from "@prisma/client";
import { decodeMetadata, encodeMetadata } from "./mappers.js";

function toDomain(row: CustomerRow): Customer {
  return {
    id: brand<string, "CustomerId">(row.id),
    merchantId: brand<string, "MerchantId">(row.merchantId),
    email: row.email ?? undefined,
    phone: row.phone ?? undefined,
    name: row.name ?? undefined,
    createdAt: row.createdAt as ISODateString,
    metadata: decodeMetadata(row.metadata),
  };
}

export class PrismaCustomerRepository implements CustomerRepository {
  constructor(private readonly client: PrismaClient) {}

  async findById(id: CustomerId): Promise<Customer | null> {
    const row = await this.client.customer.findUnique({ where: { id } });
    return row ? toDomain(row) : null;
  }

  async save(customer: Customer): Promise<void> {
    const data = {
      merchantId: customer.merchantId,
      email: customer.email ?? null,
      phone: customer.phone ?? null,
      name: customer.name ?? null,
      createdAt: customer.createdAt,
      metadata: encodeMetadata(customer.metadata),
    };
    await this.client.customer.upsert({
      where: { id: customer.id },
      create: { id: customer.id, ...data },
      update: data,
    });
  }
}
