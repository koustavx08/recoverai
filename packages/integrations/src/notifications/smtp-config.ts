export interface SmtpCredentials {
  readonly host: string;
  readonly port: number;
  /** Defaults to `port === 465` when omitted, matching nodemailer's own convention. */
  readonly secure?: boolean;
  readonly user: string;
  readonly password: string;
  /** The address emails are sent from, e.g. "RecoverAI <recovery@merchant.example>". */
  readonly fromAddress: string;
}
