# Sample data

Deterministic, synthetic payment data used for local development, tests,
and CLI demos. Nothing here is real personal or financial information.

- `merchants.json` — 2 sample merchants.
- `customers.json` — 10 sample customers, keyed to the merchants above.
- `transactions.json` — 12 sample transactions. Each transaction's
  `metadata.scenario` field labels which revenue-risk scenario it
  represents:

  | scenario                    | status    | notes                                    |
  | --------------------------- | --------- | ---------------------------------------- |
  | `successful_payment`        | succeeded | baseline "nothing to recover" case       |
  | `issuer_decline`            | failed    | card issuer declined                     |
  | `insufficient_funds`        | failed    | card had insufficient balance            |
  | `upi_failure`               | failed    | UPI collect request expired              |
  | `network_timeout`           | failed    | gateway timed out                        |
  | `expired_card`              | failed    | card expired                             |
  | `checkout_abandonment`      | abandoned | customer never completed an attempt      |
  | `repeated_payment_failures` | failed    | 3 attempts across 2 payment methods      |
  | `refund`                    | refunded  | payment succeeded, later refunded        |
  | `pending_authorization`     | pending   | attempt still awaiting bank confirmation |
  | `authentication_failed`     | failed    | 3-D Secure step not completed            |

The shape of each record intentionally mirrors the domain types in
`@recoverai/core` (`Transaction`, `PaymentAttempt`, `Customer`,
`Merchant`) closely enough to be used directly as fixtures in tests, but
these are plain JSON files, not branded/typed values — a loader is
responsible for validating and converting them.

- `transactions.csv` — 10 sample transactions in the "flat" ingestion
  shape (one row per transaction, no nested attempts — see
  `@recoverai/analysis`'s `NormalizedTransaction`). Demonstrates the CSV
  ingestion path (`recoverai ingest --file data/samples/transactions.csv`)
  independently of the richer JSON fixture above.

Ingest either file directly:

```bash
recoverai ingest --file data/samples/transactions.json
recoverai ingest --file data/samples/transactions.csv
recoverai analyze --file data/samples/transactions.json
```

To generate a larger, still-deterministic dataset, run:

```bash
pnpm generate:data -- --count 10000 --seed 42
```

which writes to `data/generated/` (gitignored).
