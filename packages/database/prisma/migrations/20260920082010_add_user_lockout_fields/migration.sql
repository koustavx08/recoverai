-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "createdAt" TEXT NOT NULL,
    "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TEXT
);
INSERT INTO "new_User" ("createdAt", "email", "id", "merchantId", "passwordHash") SELECT "createdAt", "email", "id", "merchantId", "passwordHash" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE INDEX "User_merchantId_idx" ON "User"("merchantId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
