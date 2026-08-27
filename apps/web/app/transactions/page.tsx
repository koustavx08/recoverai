import Link from "next/link";
import { ArrowLeftRight } from "lucide-react";
import { Topbar } from "@/components/layout/topbar";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { isDrillDownEligible, loadTransactionList } from "@/lib/transactions";
import { formatDateTime, formatMoney } from "@/lib/format";
import { STATUS_BADGE_VARIANT, STATUS_LABELS } from "@/lib/labels";
import { cn } from "@/lib/utils";
import type { TransactionStatus } from "@recoverai/core";

const STATUS_FILTERS: readonly TransactionStatus[] = [
  "failed",
  "abandoned",
  "pending",
  "succeeded",
  "refunded",
];

function isTransactionStatus(value: string | undefined): value is TransactionStatus {
  return value !== undefined && (STATUS_FILTERS as readonly string[]).includes(value);
}

interface TransactionsPageProps {
  readonly searchParams: Promise<{ status?: string }>;
}

export default async function TransactionsPage({ searchParams }: TransactionsPageProps) {
  const { status } = await searchParams;
  const statusFilter = isTransactionStatus(status) ? status : undefined;
  const view = await loadTransactionList(statusFilter);

  return (
    <>
      <Topbar
        title="Transactions"
        description="Payment events ingested from the bundled sample dataset"
      />
      <main className="flex-1 overflow-y-auto p-6">
        {!view ? (
          <EmptyState
            icon={ArrowLeftRight}
            title="No transactions ingested yet"
            description="Run the ingest command to load sample or real transaction data into RecoverAI."
            hint="recoverai ingest --file data/samples/transactions.json"
          />
        ) : (
          <div className="flex flex-col gap-4">
            <nav className="flex flex-wrap gap-2" aria-label="Filter by status">
              <FilterChip label="All" count={view.total} href="/transactions" active={!statusFilter} />
              {STATUS_FILTERS.map((filterStatus) => (
                <FilterChip
                  key={filterStatus}
                  label={STATUS_LABELS[filterStatus]}
                  count={view.statusCounts[filterStatus]}
                  href={`/transactions?status=${filterStatus}`}
                  active={statusFilter === filterStatus}
                />
              ))}
            </nav>

            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Transaction</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {view.transactions.map((transaction) => (
                    <TableRow key={transaction.id}>
                      <TableCell className="font-mono text-xs">
                        {isDrillDownEligible(transaction.status) ? (
                          <Link
                            href={`/dashboard/diagnosis/${transaction.id}`}
                            className="underline decoration-dotted underline-offset-2 hover:text-foreground"
                          >
                            {transaction.id}
                          </Link>
                        ) : (
                          transaction.id
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{transaction.customerId}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatMoney(transaction.amount)}
                      </TableCell>
                      <TableCell className="text-muted-foreground capitalize">
                        {transaction.paymentMethod.replace(/_/g, " ")}
                      </TableCell>
                      <TableCell>
                        <Badge variant={STATUS_BADGE_VARIANT[transaction.status]} className="uppercase">
                          {STATUS_LABELS[transaction.status]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDateTime(transaction.createdAt)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {view.transactions.length === 0 ? (
                <EmptyState
                  icon={ArrowLeftRight}
                  title="No transactions match this filter"
                  description="Try a different status, or view all transactions."
                  className="rounded-none border-0 border-t"
                />
              ) : null}
            </Card>

            <p className="text-xs text-muted-foreground">
              {view.total} transaction(s) ingested from data/samples/transactions.json. Failed and
              abandoned transactions link through to their full diagnosis → strategy → SIMULATED
              recovery → verification view.
            </p>
          </div>
        )}
      </main>
    </>
  );
}

function FilterChip({
  label,
  count,
  href,
  active,
}: {
  readonly label: string;
  readonly count: number;
  readonly href: string;
  readonly active: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
        active
          ? "border-accent/40 bg-accent/10 text-accent"
          : "border-border bg-card text-muted-foreground hover:border-accent/40 hover:text-accent",
      )}
    >
      {label}
      <span className="tabular-nums opacity-70">{count}</span>
    </Link>
  );
}
