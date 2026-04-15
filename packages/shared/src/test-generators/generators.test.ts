// Feature: ai-support-ops-platform, Task 1: Shared infrastructure validation
//
// This test file verifies that:
// 1. All arbitraries produce values of the correct shape
// 2. The InMemoryEventBus works correctly
// 3. The TOPICS constants are all present
//
// These are not property tests for business logic — those live in each service.
// This is a sanity check that the shared infrastructure is wired up correctly.

import * as fc from 'fast-check';
import {
  emailPayloadArbitrary,
  ticketArbitrary,
  classificationResultArbitrary,
  triageRecommendationArbitrary,
  draftResponseArbitrary,
  runbookArbitrary,
  ticketLifecycleEventArbitrary,
  lowConfidenceArbitrary,
  highConfidenceArbitrary,
} from './index';
import { TOPICS } from '../events/topics';
import { InMemoryEventBus } from '../event-bus';

// =============================================================================
// ARBITRARY SHAPE TESTS
// =============================================================================

describe('emailPayloadArbitrary', () => {
  it('always produces a payload with required fields', () => {
    // fc.assert runs the property 100 times by default with different random inputs
    fc.assert(
      fc.property(emailPayloadArbitrary, (email) => {
        // Every generated email must have these fields
        expect(typeof email.message_id).toBe('string');
        expect(email.message_id.length).toBeGreaterThan(0);
        expect(typeof email.sender_address).toBe('string');
        expect(typeof email.subject).toBe('string');
        expect(typeof email.body_text).toBe('string');
        expect(typeof email.ingested_at).toBe('string');
        expect(Array.isArray(email.attachments)).toBe(true);
        // Attachment count is 0–10
        expect(email.attachments.length).toBeGreaterThanOrEqual(0);
        expect(email.attachments.length).toBeLessThanOrEqual(10);
      })
    );
  });
});

describe('classificationResultArbitrary', () => {
  it('always produces valid priority and routing_destination values', () => {
    fc.assert(
      fc.property(classificationResultArbitrary, (result) => {
        expect(['P1', 'P2', 'P3', 'P4']).toContain(result.priority);
        expect(['Tier0', 'Tier1', 'PAM_Core', 'Integrations_Team']).toContain(
          result.routing_destination
        );
        // Confidence scores must be in [0, 1]
        expect(result.confidence.category).toBeGreaterThanOrEqual(0);
        expect(result.confidence.category).toBeLessThanOrEqual(1);
      })
    );
  });
});

describe('lowConfidenceArbitrary', () => {
  it('always has at least one dimension below 0.70', () => {
    fc.assert(
      fc.property(lowConfidenceArbitrary, (conf) => {
        const hasLowDimension =
          conf.category < 0.70 ||
          conf.priority < 0.70 ||
          conf.routing_destination < 0.70;
        expect(hasLowDimension).toBe(true);
      })
    );
  });
});

describe('highConfidenceArbitrary', () => {
  it('always has all dimensions >= 0.70', () => {
    fc.assert(
      fc.property(highConfidenceArbitrary, (conf) => {
        expect(conf.category).toBeGreaterThanOrEqual(0.70);
        expect(conf.priority).toBeGreaterThanOrEqual(0.70);
        expect(conf.routing_destination).toBeGreaterThanOrEqual(0.70);
      })
    );
  });
});

describe('ticketArbitrary', () => {
  it('always produces a ticket with a non-empty ticket_id and created_at', () => {
    fc.assert(
      fc.property(ticketArbitrary, (ticket) => {
        expect(ticket.ticket_id.length).toBeGreaterThan(0);
        expect(ticket.created_at.length).toBeGreaterThan(0);
        // created_at must be a valid ISO 8601 string with milliseconds
        expect(ticket.created_at).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/);
      })
    );
  });
});

describe('ticketLifecycleEventArbitrary', () => {
  it('always produces events with millisecond-precision occurred_at', () => {
    fc.assert(
      fc.property(ticketLifecycleEventArbitrary, (event) => {
        // ISO 8601 with milliseconds: "2024-01-15T10:30:00.123Z"
        // The regex checks for at least 3 digits after the decimal point
        expect(event.occurred_at).toMatch(/\.\d{3}/);
      })
    );
  });
});

// =============================================================================
// TOPICS CONSTANTS TEST
// =============================================================================

describe('TOPICS', () => {
  it('defines all 13 required event topics', () => {
    const topicValues = Object.values(TOPICS);
    // Verify the exact 13 topics from the design document
    expect(topicValues).toContain('email.ingested');
    expect(topicValues).toContain('email.parse_failed');
    expect(topicValues).toContain('ticket.created');
    expect(topicValues).toContain('ticket.flagged_for_review');
    expect(topicValues).toContain('ticket.routed');
    expect(topicValues).toContain('ticket.resolved');
    expect(topicValues).toContain('ticket.escalated');
    expect(topicValues).toContain('triage.override');
    expect(topicValues).toContain('response.draft_generated');
    expect(topicValues).toContain('response.approved');
    expect(topicValues).toContain('response.rejected');
    expect(topicValues).toContain('runbook.applied');
    expect(topicValues).toContain('kb.update_scheduled');
    expect(topicValues).toHaveLength(13);
  });
});

// =============================================================================
// IN-MEMORY EVENT BUS TESTS
// =============================================================================

describe('InMemoryEventBus', () => {
  let bus: InMemoryEventBus;

  // Reset the bus before each test so tests don't bleed into each other
  beforeEach(() => {
    bus = new InMemoryEventBus();
  });

  it('delivers a published event to a subscriber', async () => {
    const received: unknown[] = [];

    // Subscribe before publishing
    await bus.subscribe(TOPICS.EMAIL_INGESTED, async (payload) => {
      received.push(payload);
    });

    const testPayload = { email: { message_id: 'test-123' } };
    await bus.publish(TOPICS.EMAIL_INGESTED, testPayload);

    // The handler should have been called once with the payload
    expect(received).toHaveLength(1);
    expect(received[0]).toEqual(testPayload);
  });

  it('delivers to multiple subscribers on the same topic', async () => {
    const calls: string[] = [];

    await bus.subscribe(TOPICS.TICKET_CREATED, async () => { calls.push('subscriber-1'); });
    await bus.subscribe(TOPICS.TICKET_CREATED, async () => { calls.push('subscriber-2'); });

    await bus.publish(TOPICS.TICKET_CREATED, {});

    expect(calls).toEqual(['subscriber-1', 'subscriber-2']);
  });

  it('does not deliver to subscribers on a different topic', async () => {
    const received: unknown[] = [];

    await bus.subscribe(TOPICS.EMAIL_INGESTED, async (p) => { received.push(p); });

    // Publish to a DIFFERENT topic
    await bus.publish(TOPICS.TICKET_CREATED, { ticket_id: 'abc' });

    expect(received).toHaveLength(0);
  });

  it('records all published events in the .published array', async () => {
    await bus.publish(TOPICS.EMAIL_INGESTED, { a: 1 });
    await bus.publish(TOPICS.TICKET_CREATED, { b: 2 });

    expect(bus.published).toHaveLength(2);
    expect(bus.published[0]).toEqual({ topic: 'email.ingested', payload: { a: 1 } });
    expect(bus.published[1]).toEqual({ topic: 'ticket.created', payload: { b: 2 } });
  });

  it('reset() clears all handlers and published events', async () => {
    const received: unknown[] = [];
    await bus.subscribe(TOPICS.EMAIL_INGESTED, async (p) => { received.push(p); });
    await bus.publish(TOPICS.EMAIL_INGESTED, { x: 1 });

    bus.reset();

    // After reset, the published array is cleared
    expect(bus.published).toHaveLength(0);

    // Publishing again after reset should NOT call the old handler (it was cleared)
    await bus.publish(TOPICS.EMAIL_INGESTED, { x: 2 });
    expect(received).toHaveLength(1); // Only the pre-reset publish reached the handler

    // But the new publish IS recorded in the published array
    expect(bus.published).toHaveLength(1);
    expect(bus.published[0]).toEqual({ topic: 'email.ingested', payload: { x: 2 } });
  });
});
