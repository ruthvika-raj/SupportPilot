import type { TopicName } from '../events/topics';

// =============================================================================
// EVENT BUS ABSTRACTION
//
// Why an interface instead of a direct Kafka/EventBridge import?
//
// Services should depend on a *capability* (publish/subscribe) not on a
// specific technology (Kafka). This pattern is called "Dependency Inversion":
// high-level modules (services) depend on abstractions, not concretions.
//
// Benefits:
// 1. Swap Kafka for EventBridge without touching service code.
// 2. Inject an InMemoryEventBus in tests — no real broker needed.
// 3. Each service is independently testable in isolation.
// =============================================================================

/**
 * A handler function called when an event arrives on a subscribed topic.
 * The payload is typed as `unknown` here because the interface doesn't know
 * which topic you're subscribing to. Each service casts to the correct
 * payload type after subscribing.
 */
export type EventHandler = (payload: unknown) => Promise<void>;

/**
 * The contract every event bus implementation must satisfy.
 * Services import and use only this interface.
 */
export interface IEventBus {
  /**
   * Publish an event to a topic.
   *
   * @param topic  - The topic name (use TOPICS constants, not raw strings)
   * @param payload - The event data. Must be JSON-serializable.
   */
  publish(topic: TopicName, payload: unknown): Promise<void>;

  /**
   * Subscribe to a topic. The handler is called for every event received.
   * At-least-once delivery: the handler may be called more than once for
   * the same event (e.g. after a broker restart). Services must be idempotent.
   *
   * @param topic   - The topic to subscribe to
   * @param handler - Async function called with each event's payload
   */
  subscribe(topic: TopicName, handler: EventHandler): Promise<void>;
}

// =============================================================================
// IN-MEMORY IMPLEMENTATION (for tests and local development)
//
// This is NOT a production implementation. It runs entirely in-process,
// with no persistence and no network. It's used in unit tests so services
// can be tested without a running Kafka cluster.
// =============================================================================

/**
 * A simple in-memory event bus for testing.
 *
 * How it works:
 * - `handlers` is a Map from topic name → array of handler functions
 * - `publish` looks up all handlers for the topic and calls each one
 * - `subscribe` pushes a handler into the array for that topic
 *
 * This means events are delivered synchronously within the same process,
 * which makes tests deterministic (no timing issues).
 */
export class InMemoryEventBus implements IEventBus {
  /**
   * Map from topic name to the list of handlers subscribed to that topic.
   * Using Map<string, EventHandler[]> because a topic can have multiple
   * subscribers (e.g. both Triage_Engine and Observability_Service subscribe
   * to 'ticket.created').
   */
  private handlers: Map<string, EventHandler[]> = new Map();

  /**
   * Records every published event in order.
   * Tests can inspect this to assert that the right events were emitted.
   *
   * Example:
   *   expect(bus.published).toContainEqual({
   *     topic: 'email.ingested',
   *     payload: { email: { message_id: '...' } }
   *   });
   */
  public published: Array<{ topic: string; payload: unknown }> = [];

  async publish(topic: TopicName, payload: unknown): Promise<void> {
    // Record the event so tests can inspect it
    this.published.push({ topic, payload });

    // Deliver to all subscribers
    const topicHandlers = this.handlers.get(topic) ?? [];
    for (const handler of topicHandlers) {
      await handler(payload);
    }
  }

  async subscribe(topic: TopicName, handler: EventHandler): Promise<void> {
    // Get the existing handler list for this topic, or start a new one
    const existing = this.handlers.get(topic) ?? [];
    this.handlers.set(topic, [...existing, handler]);
  }

  /**
   * Utility for tests: reset all state between test cases.
   * Call this in `beforeEach` to ensure tests don't bleed into each other.
   */
  reset(): void {
    this.handlers.clear();
    this.published = [];
  }
}
