-- CreateTable
CREATE TABLE "Merchant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "websiteUrl" TEXT,
    "defaultCurrency" TEXT NOT NULL,
    "createdAt" TEXT NOT NULL,
    "metadata" TEXT
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "merchantId" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "name" TEXT,
    "createdAt" TEXT NOT NULL,
    "metadata" TEXT
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "merchantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "paymentMethod" TEXT NOT NULL,
    "createdAt" TEXT NOT NULL,
    "updatedAt" TEXT NOT NULL,
    "metadata" TEXT
);

-- CreateTable
CREATE TABLE "PaymentAttempt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "transactionId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "paymentMethod" TEXT NOT NULL,
    "failureReasonCode" TEXT,
    "providerErrorMessage" TEXT,
    "attemptedAt" TEXT NOT NULL,
    CONSTRAINT "PaymentAttempt_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RevenueRisk" (
    "transactionId" TEXT NOT NULL PRIMARY KEY,
    "riskScore" REAL NOT NULL,
    "recoverabilityScore" REAL NOT NULL,
    "expectedRecoveryAmount" INTEGER NOT NULL,
    "expectedRecoveryCurrency" TEXT NOT NULL,
    "failureReasonCode" TEXT NOT NULL,
    "failureReasonDescription" TEXT NOT NULL,
    "failureReasonRecoverable" BOOLEAN NOT NULL,
    "failureReasonSeverity" TEXT NOT NULL,
    "failureReasonConfidence" REAL NOT NULL,
    "failureReasonEvidence" TEXT NOT NULL,
    "priority" TEXT NOT NULL,
    "recommendedStrategy" TEXT NOT NULL,
    "explanation" TEXT NOT NULL,
    "assessedAt" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "RecoveryAction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "transactionId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "strategy" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "scheduledAt" TEXT,
    "executedAt" TEXT,
    "metadata" TEXT
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "transactionId" TEXT,
    "actorType" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "data" TEXT,
    "occurredAt" TEXT NOT NULL
);

-- CreateIndex
CREATE INDEX "Customer_merchantId_idx" ON "Customer"("merchantId");

-- CreateIndex
CREATE INDEX "Transaction_merchantId_idx" ON "Transaction"("merchantId");

-- CreateIndex
CREATE INDEX "PaymentAttempt_transactionId_idx" ON "PaymentAttempt"("transactionId");

-- CreateIndex
CREATE INDEX "RecoveryAction_transactionId_idx" ON "RecoveryAction"("transactionId");

-- CreateIndex
CREATE INDEX "AuditEvent_merchantId_idx" ON "AuditEvent"("merchantId");
