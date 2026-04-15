/**
 * All event topic names used across the platform's event bus.
 *
 * Using constants instead of raw strings means:
 * 1. A typo is a compile error, not a silent runtime bug.
 * 2. Renaming a topic is a single change here, not a grep-and-replace.
 * 3. Every service imports from this file, so the topic list is the
 *    single source of truth for what events exist.
 */
export const TOPICS = {
  // Email_Ingestion_Service publishes these
  EMAIL_INGESTED: 'email.ingested',
  EMAIL_PARSE_FAILED: 'email.parse_failed',

  // Ticket_Service publishes these
  TICKET_CREATED: 'ticket.created',
  TICKET_FLAGGED_FOR_REVIEW: 'ticket.flagged_for_review',
  TICKET_ROUTED: 'ticket.routed',
  TICKET_RESOLVED: 'ticket.resolved',
  TICKET_ESCALATED: 'ticket.escalated',

  // Triage_Engine publishes this
  TRIAGE_OVERRIDE: 'triage.override',

  // Auto_Response_Engine publishes this
  RESPONSE_DRAFT_GENERATED: 'response.draft_generated',

  // Approval_Queue publishes these
  RESPONSE_APPROVED: 'response.approved',
  RESPONSE_REJECTED: 'response.rejected',

  // Runbook_Service publishes this
  RUNBOOK_APPLIED: 'runbook.applied',

  // Approval_Queue publishes this to trigger KB updates
  KB_UPDATE_SCHEDULED: 'kb.update_scheduled',
} as const;

/**
 * `as const` makes every value a string literal type rather than just `string`.
 * So TOPICS.EMAIL_INGESTED has type `"email.ingested"`, not `string`.
 * This lets TypeScript catch mismatches when you pass a topic to a function
 * that expects a specific topic name.
 */

/** The union type of all valid topic strings */
export type TopicName = typeof TOPICS[keyof typeof TOPICS];
