import type { User, UserId, UserRepository } from "@recoverai/core";

export class InMemoryUserRepository implements UserRepository {
  private readonly byId = new Map<UserId, User>();

  async findById(id: UserId): Promise<User | null> {
    return this.byId.get(id) ?? null;
  }

  async findByEmail(email: string): Promise<User | null> {
    for (const user of this.byId.values()) {
      if (user.email === email) return user;
    }
    return null;
  }

  async save(user: User): Promise<void> {
    this.byId.set(user.id, user);
  }
}
