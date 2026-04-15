import type {
  EmailPayload,
  ExtractionResult,
  ClassificationResult,
  Ticket,
  TriageOverride,
  DraftResponse,
  Runbook,
} from '../types';

// =============================================================================
// EVENT PAYLOAD TYPES
//
// Each interface here defines the data shape carried by a specific event topic.
// Keeping these separate from the domain types (in types/index.ts) means the
// domain types stay clean — they don't need to know about the event bus.
// =============================================================================

export interface EmailIngestedPayload {
  email: EmailPayload;
}

export interface EmailParseFailedPayload {
  /** The raw bytes of the email that failed to parse, base64-encoded */
  raw_email_b64: string;
  error_message: string;
  failed_at: string;
}

export interface TicketCreatedPayload {
  ticket: Ticket;
}

export interface TicketFlaggedForReviewPayload {
  ticket_id: string;
  reason: 'low_confidence';
  classifier_confidence: {
    category: number;
    priority: number;
    routing_destination: number;
  };
}

export interface TicketRoutedPayload {
  ticket_id: string;
  routing_destination: string;
  routed_at: string;
}

export interface TicketResolvedPayload {
  ticket_id: string;
  resolved_at: string;
  resolved_by: string;
  resolution_method: string;
}

export interface TicketEscalatedPayload {
  ticket_id: string;
  from_tier: string;
  to_tier: string;
  escalated_at: string;
}

export interface TriageOverridePayload {
  ticket_id: string;
  override: TriageOverride;
}

export interface ResponseDraftGeneratedPayload {
  draft: DraftResponse;
}

export interface ResponseApprovedPayload {
  draft_id: string;
  ticket_id: string;
  reviewed_by: string;
  reviewed_at: string;
}

export interface ResponseRejectedPayload {
  draft_id: string;
  ticket_id: string;
  reviewed_by: string;
  reviewed_at: string;
  rejection_reason: string;
}

export interface RunbookAppliedPayload {
  ticket_id: string;
  runbook_id: string;
  resolution_timestamp: string;
  applied_by: string;
}

export interface KbUpdateScheduledPayload {
  triggered_by_draft_id: string;
  scheduled_at: string;
}
