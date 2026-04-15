// =============================================================================
// EMAIL TYPES
// =============================================================================

/**
 * The structured payload produced by Email_Ingestion_Service after parsing
 * a raw inbound email. This is what gets published on the `email.ingested`
 * event topic and consumed by Extraction_Engine.
 */
export interface EmailPayload {
  /** RFC 2822 Message-ID header — used for deduplication (Req 1.4) */
  message_id: string;

  /** ISO 8601 with milliseconds, e.g. "2024-01-15T10:30:00.123Z" */
  ingested_at: string;

  sender_address: string;
  subject: string;
  body_text: string;

  /** Optional — not all emails have HTML bodies */
  body_html?: string;

  /** Empty array if no attachments — never null (Req 1.5) */
  attachments: AttachmentMetadata[];
}

/**
 * Metadata about a single email attachment. The binary content is stored
 * in object storage (e.g. S3); this record carries only the reference.
 */
export interface AttachmentMetadata {
  filename: string;
  mime_type: string;
  size_bytes: number;

  /** Object storage key, e.g. "s3://bucket/attachments/abc123.pdf" */
  storage_reference: string;
}

// =============================================================================
// TICKET TYPES
// =============================================================================

/**
 * The central record of the platform. Created by Ticket_Service from the
 * combined output of Extraction_Engine + AI_Classifier.
 */
export interface Ticket {
  /** UUID v4, assigned at creation, never changes (Req 2.5) */
  ticket_id: string;

  /** ISO 8601 with milliseconds */
  created_at: string;

  /** Links back to the source EmailPayload */
  email_message_id: string;

  // --- Fields extracted by Extraction_Engine ---
  customer_id: string;
  product_area: string;
  error_code?: string;
  issue_description: string;

  // --- Fields produced by AI_Classifier ---
  category: string;
  priority: 'P1' | 'P2' | 'P3' | 'P4';
  routing_destination: RoutingDestination;
  classifier_confidence: ClassifierConfidence;

  /**
   * Set to true when any confidence dimension < 0.70 (Req 2.4).
   * Ticket_Service computes this from classifier_confidence.
   */
  requires_human_review: boolean;

  status: TicketStatus;

  /** Populated after Triage_Engine processes the ticket */
  triage_recommendation?: TriageRecommendation;

  /** Populated when the ticket is resolved */
  resolution?: TicketResolution;

  /** Set when this ticket is part of an A/B experiment (Req 7.3) */
  experiment_id?: string;
}

/** The four valid routing destinations across the platform */
export type RoutingDestination = 'Tier0' | 'Tier1' | 'PAM_Core' | 'Integrations_Team';

/**
 * Per-dimension confidence scores from AI_Classifier.
 * Each value is in [0.0, 1.0].
 */
export interface ClassifierConfidence {
  category: number;
  priority: number;
  routing_destination: number;
}

/**
 * The lifecycle states a ticket moves through.
 * - created         → just inserted, not yet triaged
 * - pending_human_review → confidence gate triggered (Req 2.4)
 * - triaged         → Triage_Engine has produced a recommendation
 * - pending_approval → Tier 0 draft generated, waiting for Agent
 * - resolved        → ticket closed
 * - escalated       → moved to a higher tier
 */
export type TicketStatus =
  | 'created'
  | 'pending_human_review'
  | 'triaged'
  | 'pending_approval'
  | 'resolved'
  | 'escalated';

/** The routing recommendation produced by Triage_Engine */
export interface TriageRecommendation {
  /** ISO 8601 with milliseconds */
  recommended_at: string;
  routing_destination: RoutingDestination;

  /** Confidence of the triage model's prediction, in [0.0, 1.0] */
  confidence: number;

  /** Present only if an Agent overrode the recommendation */
  override?: TriageOverride;
}

/** Recorded when an Agent manually overrides a triage recommendation (Req 3.6) */
export interface TriageOverride {
  overridden_at: string;
  agent_id: string;
  new_destination: string;
  reason: string;
}

/** How and by whom a ticket was resolved */
export interface TicketResolution {
  resolved_at: string;

  /** 'auto' for Tier 0 automated resolution; agent_id for human resolution */
  resolved_by: 'auto' | string;

  resolution_method: 'auto_response' | 'runbook' | 'manual';
  runbook_id?: string;
  kb_article_id?: string;
}

// =============================================================================
// CLASSIFICATION TYPES
// =============================================================================

/**
 * The structured fields extracted from an email by Extraction_Engine.
 * This is the input to AI_Classifier.
 */
export interface ExtractionResult {
  email_message_id: string;
  customer_id: string;
  product_area: string;
  error_code?: string;
  issue_description: string;
  sentiment_score?: number;
}

/**
 * The output of AI_Classifier. Combined with ExtractionResult to create
 * a Ticket record.
 */
export interface ClassificationResult {
  category: string;
  priority: 'P1' | 'P2' | 'P3' | 'P4';
  routing_destination: RoutingDestination;
  confidence: ClassifierConfidence;

  /**
   * True when any confidence dimension < 0.70.
   * AI_Classifier sets this; Ticket_Service enforces it.
   */
  requires_human_review: boolean;
}

// =============================================================================
// AUTO-RESPONSE TYPES
// =============================================================================

/** A draft response generated by Auto_Response_Engine for a Tier 0 ticket */
export interface DraftResponse {
  /** UUID v4 */
  draft_id: string;
  ticket_id: string;

  /** ISO 8601 with milliseconds */
  generated_at: string;

  /** The Knowledge_Base article that was used to generate this draft */
  kb_article_id: string;

  /** Model confidence in the draft, in [0.0, 1.0] */
  confidence_score: number;

  draft_text: string;
  status: 'pending' | 'approved' | 'rejected';

  /** Populated after Agent review */
  reviewed_by?: string;
  reviewed_at?: string;
  rejection_reason?: string;
}

// =============================================================================
// RUNBOOK TYPES
// =============================================================================

/** A structured, step-by-step guide for resolving a class of issue */
export interface Runbook {
  /** UUID v4 */
  runbook_id: string;
  title: string;
  description: string;
  category: string;
  created_by: string;
  published_at?: string;
  steps: RunbookStep[];

  /** Populated on search results — not stored in the runbook record itself */
  relevance_score?: number;
}

/** A single step within a Runbook */
export interface RunbookStep {
  step_id: string;

  /** 1-based ordering within the runbook */
  order: number;

  description: string;
  expected_outcome: string;

  /** Optional — only present for steps that can be automated */
  action?: AutomatedAction;
}

/** An automated action that can be triggered from a Runbook step */
export interface AutomatedAction {
  action_type: 'webhook' | 'lambda' | 'script';

  /** URL, Lambda ARN, or script identifier depending on action_type */
  action_reference: string;

  /** The result of the last execution of this action */
  last_result?: ActionResult;
}

/** The captured result of executing an AutomatedAction */
export interface ActionResult {
  executed_at: string;
  success: boolean;
  output: string;
  error_output?: string;
}

// =============================================================================
// OBSERVABILITY TYPES
// =============================================================================

/**
 * Every domain event that flows through the platform is also recorded
 * as a TicketLifecycleEvent in the Observability_Service's event store.
 */
export interface TicketLifecycleEvent {
  /** UUID v4 */
  event_id: string;
  event_type: TicketEventType;
  ticket_id: string;

  /** ISO 8601 with milliseconds — millisecond precision is required (Req 4.1) */
  occurred_at: string;

  /** Event-specific data — varies by event_type */
  payload: Record<string, unknown>;
}

/** All event types tracked by Observability_Service */
export type TicketEventType =
  | 'ticket.created'
  | 'ticket.flagged_for_review'
  | 'ticket.routed'
  | 'ticket.resolved'
  | 'ticket.escalated'
  | 'triage.override'
  | 'response.draft_generated'
  | 'response.approved'
  | 'response.rejected'
  | 'runbook.applied';

/** Pre-aggregated metrics read by the Dashboard */
export interface SupportMetrics {
  computed_at: string;
  open_ticket_count: number;
  resolution_rates: ResolutionRate[];
  escalation_patterns: EscalationPattern[];
}

export interface ResolutionRate {
  window: '24h' | '7d' | '30d';
  tier0_rate: number;
  tier1_rate: number;
  tier2_rate: number;
}

export interface EscalationPattern {
  from_tier: string;
  to_tier: string;
  count: number;
  percentage: number;
  window: '24h' | '7d' | '30d';
}

// =============================================================================
// KNOWLEDGE BASE TYPES
// =============================================================================

export interface KBArticle {
  /** UUID v4 */
  article_id: string;
  category: string;
  title: string;
  content: string;
  source_ticket_ids: string[];
  created_at: string;
  updated_at: string;

  /**
   * Stored in the vector DB — intentionally omitted from API responses
   * to avoid sending large float arrays over the wire.
   */
  embedding_vector?: number[];
}

// =============================================================================
// EXPERIMENT TYPES
// =============================================================================

/** An A/B experiment configuration managed by Funnel_Optimizer */
export interface Experiment {
  /** UUID v4 */
  experiment_id: string;
  name: string;
  ticket_category: string;
  control_routing: string;
  experimental_routing: string;

  /** 0–100: percentage of matching tickets routed to the experimental path */
  traffic_split_percent: number;

  started_at: string;
  ended_at?: string;
  status: 'active' | 'concluded' | 'discarded';

  /** The manager who created this experiment */
  created_by: string;
}
