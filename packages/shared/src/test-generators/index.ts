import * as fc from 'fast-check';
import type {
  EmailPayload,
  AttachmentMetadata,
  Ticket,
  ClassifierConfidence,
  ClassificationResult,
  ExtractionResult,
  TriageRecommendation,
  DraftResponse,
  Runbook,
  RunbookStep,
  TicketLifecycleEvent,
  TicketStatus,
  RoutingDestination,
  TicketEventType,
} from '../types';

// =============================================================================
// FAST-CHECK ARBITRARIES
//
// An "arbitrary" is a generator that fast-check uses to produce random test
// inputs. We define one per domain type.
//
// Why define them here in `shared`?
// Because multiple services test against the same types. If Email_Ingestion_Service
// and Extraction_Engine both need random EmailPayload values, they should use
// the same generator — not each define their own (which might diverge).
// =============================================================================

// --- Primitive helpers -------------------------------------------------------

/**
 * Generates a UUID v4 string.
 * We use fc.uuid() which is built into fast-check.
 */
export const uuidArbitrary = fc.uuid();

/**
 * Generates an ISO 8601 timestamp with millisecond precision.
 * e.g. "2024-03-15T14:22:33.456Z"
 *
 * How it works:
 * - fc.date() generates a random Date object
 * - .map(d => d.toISOString()) converts it to a string
 * - toISOString() always includes milliseconds: "...T14:22:33.456Z"
 */
export const isoTimestampArbitrary = fc
  .date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') })
  .map(d => d.toISOString());

/**
 * Generates a valid email address string.
 * fc.emailAddress() is a built-in fast-check arbitrary.
 */
export const emailAddressArbitrary = fc.emailAddress();

// --- AttachmentMetadata ------------------------------------------------------

export const attachmentMetadataArbitrary: fc.Arbitrary<AttachmentMetadata> = fc.record({
  filename: fc.string({ minLength: 1, maxLength: 50 }),
  mime_type: fc.constantFrom(
    'application/pdf',
    'image/png',
    'image/jpeg',
    'text/plain',
    'application/zip'
  ),
  // fc.integer with min/max generates a random integer in that range
  size_bytes: fc.integer({ min: 1, max: 10_000_000 }),
  storage_reference: fc.string({ minLength: 10, maxLength: 100 }),
});

// --- EmailPayload ------------------------------------------------------------

/**
 * Generates random EmailPayload values.
 *
 * Key design decisions:
 * - attachment count varies from 0 to 10 (per the spec)
 * - body_html is optional (50% chance of being present)
 * - message_id is a UUID (real message IDs are more complex, but UUID
 *   is sufficient for testing deduplication logic)
 */
export const emailPayloadArbitrary: fc.Arbitrary<EmailPayload> = fc.record({
  message_id: uuidArbitrary,
  ingested_at: isoTimestampArbitrary,
  sender_address: emailAddressArbitrary,
  subject: fc.string({ minLength: 1, maxLength: 200 }),
  body_text: fc.string({ minLength: 1, maxLength: 5000 }),
  // fc.option generates either the value or undefined (50/50 by default)
  body_html: fc.option(fc.string({ minLength: 1, maxLength: 5000 }), { nil: undefined }),
  // fc.array generates an array with length between min and max
  attachments: fc.array(attachmentMetadataArbitrary, { minLength: 0, maxLength: 10 }),
});

// --- ClassifierConfidence ----------------------------------------------------

/**
 * Generates confidence scores in [0.0, 1.0].
 * fc.float({ min: 0, max: 1 }) generates a float in that range.
 */
export const classifierConfidenceArbitrary: fc.Arbitrary<ClassifierConfidence> = fc.record({
  category: fc.float({ min: 0, max: 1, noNaN: true }),
  priority: fc.float({ min: 0, max: 1, noNaN: true }),
  routing_destination: fc.float({ min: 0, max: 1, noNaN: true }),
});

/**
 * Generates confidence where at least one dimension is below 0.70.
 * Used to test the confidence-gate rule (Req 2.4).
 *
 * How it works:
 * - Generate a full confidence record
 * - Pick one dimension at random to force below 0.70
 * - fc.tuple combines multiple arbitraries into a tuple
 */
export const lowConfidenceArbitrary: fc.Arbitrary<ClassifierConfidence> = fc
  .tuple(
    classifierConfidenceArbitrary,
    fc.constantFrom('category', 'priority', 'routing_destination') as fc.Arbitrary<keyof ClassifierConfidence>,
    fc.float({ min: 0, max: Math.fround(0.699), noNaN: true })
  )
  .map(([conf, dimension, lowValue]) => ({
    ...conf,
    [dimension]: lowValue,
  }));

/**
 * Generates confidence where ALL dimensions are >= 0.70.
 * Used to test the "no review needed" path.
 */
export const highConfidenceArbitrary: fc.Arbitrary<ClassifierConfidence> = fc.record({
  // Use fc.double (64-bit) to avoid 32-bit float precision issues near 0.70.
  // fc.float uses 32-bit floats; Math.fround(0.70) = 0.699999988... which is < 0.70.
  category: fc.double({ min: 0.70, max: 1, noNaN: true }),
  priority: fc.double({ min: 0.70, max: 1, noNaN: true }),
  routing_destination: fc.double({ min: 0.70, max: 1, noNaN: true }),
});

// --- ClassificationResult ----------------------------------------------------

export const routingDestinationArbitrary: fc.Arbitrary<RoutingDestination> = fc.constantFrom(
  'Tier0',
  'Tier1',
  'PAM_Core',
  'Integrations_Team'
);

export const priorityArbitrary: fc.Arbitrary<'P1' | 'P2' | 'P3' | 'P4'> = fc.constantFrom(
  'P1' as const,
  'P2' as const,
  'P3' as const,
  'P4' as const
);

export const classificationResultArbitrary: fc.Arbitrary<ClassificationResult> = fc
  .record({
    category: fc.string({ minLength: 1, maxLength: 50 }),
    priority: priorityArbitrary,
    routing_destination: routingDestinationArbitrary,
    confidence: classifierConfidenceArbitrary,
  })
  .map(result => ({
    ...result,
    // Compute requires_human_review from the confidence scores
    // This mirrors the logic in Ticket_Service (Req 2.4)
    requires_human_review:
      result.confidence.category < 0.70 ||
      result.confidence.priority < 0.70 ||
      result.confidence.routing_destination < 0.70,
  }));

// --- ExtractionResult --------------------------------------------------------

export const extractionResultArbitrary: fc.Arbitrary<ExtractionResult> = fc.record({
  email_message_id: uuidArbitrary,
  customer_id: fc.string({ minLength: 1, maxLength: 50 }),
  product_area: fc.constantFrom('billing', 'auth', 'integrations', 'core', 'reporting'),
  error_code: fc.option(fc.string({ minLength: 3, maxLength: 10 }), { nil: undefined }),
  issue_description: fc.string({ minLength: 10, maxLength: 500 }),
  sentiment_score: fc.option(fc.float({ min: -1, max: 1, noNaN: true }), { nil: undefined }),
});

// --- Ticket ------------------------------------------------------------------

export const ticketStatusArbitrary: fc.Arbitrary<TicketStatus> = fc.constantFrom(
  'created',
  'pending_human_review',
  'triaged',
  'pending_approval',
  'resolved',
  'escalated'
);

export const ticketArbitrary: fc.Arbitrary<Ticket> = fc
  .tuple(extractionResultArbitrary, classificationResultArbitrary, uuidArbitrary, isoTimestampArbitrary)
  .map(([extraction, classification, ticketId, createdAt]) => ({
    ticket_id: ticketId,
    created_at: createdAt,
    email_message_id: extraction.email_message_id,
    customer_id: extraction.customer_id,
    product_area: extraction.product_area,
    error_code: extraction.error_code,
    issue_description: extraction.issue_description,
    category: classification.category,
    priority: classification.priority,
    routing_destination: classification.routing_destination,
    classifier_confidence: classification.confidence,
    requires_human_review: classification.requires_human_review,
    status: 'created' as TicketStatus,
  }));

// --- TriageRecommendation ----------------------------------------------------

export const triageRecommendationArbitrary: fc.Arbitrary<TriageRecommendation> = fc.record({
  recommended_at: isoTimestampArbitrary,
  routing_destination: routingDestinationArbitrary,
  confidence: fc.float({ min: 0, max: 1, noNaN: true }),
});

// --- DraftResponse -----------------------------------------------------------

export const draftResponseArbitrary: fc.Arbitrary<DraftResponse> = fc.record({
  draft_id: uuidArbitrary,
  ticket_id: uuidArbitrary,
  generated_at: isoTimestampArbitrary,
  kb_article_id: uuidArbitrary,
  confidence_score: fc.float({ min: 0, max: 1, noNaN: true }),
  draft_text: fc.string({ minLength: 10, maxLength: 2000 }),
  status: fc.constantFrom('pending', 'approved', 'rejected'),
  reviewed_by: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
  reviewed_at: fc.option(isoTimestampArbitrary, { nil: undefined }),
  rejection_reason: fc.option(fc.string({ minLength: 1, maxLength: 500 }), { nil: undefined }),
});

// --- Runbook -----------------------------------------------------------------

export const runbookStepArbitrary: fc.Arbitrary<RunbookStep> = fc.record({
  step_id: uuidArbitrary,
  order: fc.integer({ min: 1, max: 20 }),
  description: fc.string({ minLength: 5, maxLength: 500 }),
  expected_outcome: fc.string({ minLength: 5, maxLength: 500 }),
  // action is optional — 50% chance of being present
  action: fc.option(
    fc.record({
      action_type: fc.constantFrom('webhook', 'lambda', 'script'),
      action_reference: fc.string({ minLength: 5, maxLength: 200 }),
    }),
    { nil: undefined }
  ),
});

export const runbookArbitrary: fc.Arbitrary<Runbook> = fc.record({
  runbook_id: uuidArbitrary,
  title: fc.string({ minLength: 3, maxLength: 100 }),
  description: fc.string({ minLength: 10, maxLength: 500 }),
  category: fc.constantFrom('billing', 'auth', 'integrations', 'core', 'reporting'),
  created_by: fc.string({ minLength: 1, maxLength: 50 }),
  published_at: fc.option(isoTimestampArbitrary, { nil: undefined }),
  // 1–10 steps per runbook
  steps: fc.array(runbookStepArbitrary, { minLength: 1, maxLength: 10 }),
  relevance_score: fc.option(fc.float({ min: 0, max: 1, noNaN: true }), { nil: undefined }),
});

// --- TicketLifecycleEvent ----------------------------------------------------

export const ticketEventTypeArbitrary: fc.Arbitrary<TicketEventType> = fc.constantFrom(
  'ticket.created',
  'ticket.flagged_for_review',
  'ticket.routed',
  'ticket.resolved',
  'ticket.escalated',
  'triage.override',
  'response.draft_generated',
  'response.approved',
  'response.rejected',
  'runbook.applied'
);

export const ticketLifecycleEventArbitrary: fc.Arbitrary<TicketLifecycleEvent> = fc.record({
  event_id: uuidArbitrary,
  event_type: ticketEventTypeArbitrary,
  ticket_id: uuidArbitrary,
  occurred_at: isoTimestampArbitrary,
  // payload is event-specific; for generator purposes we use a simple object
  payload: fc.record({
    detail: fc.string({ minLength: 0, maxLength: 100 }),
  }),
});
