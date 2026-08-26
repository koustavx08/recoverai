import type { Customer, CustomerId, CustomerRepository } from "@recoverai/core";

export class InMemoryCustomerRepository implements CustomerRepository {
  private readonly byId = new Map<CustomerId, Customer>();

  async findById(id: CustomerId): Promise<Customer | null> {
    return this.byId.get(id) ?? null;
  }

  async save(customer: Customer): Promise<void> {
    this.byId.set(customer.id, customer);
  }
}
