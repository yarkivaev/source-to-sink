import mqtt from 'mqtt';

/**
 * Idle state for MQTT source.
 *
 * @returns {object} State with subscribed() returning false
 */
function idle() {
  return {
    subscribed() {
      return false;
    }
  };
}

/**
 * Subscribed state for MQTT source.
 *
 * @param {object} client - MQTT client
 * @param {function} handler - Message handler function
 * @returns {object} State with subscribed() returning true
 */
function subscribed(client, handler) {
  return {
    subscribed() {
      return true;
    },
    client() {
      return client;
    },
    handler() {
      return handler;
    }
  };
}

/**
 * MQTT subscription source for streaming messages to a collector.
 *
 * Subscribes to MQTT topics and forwards raw messages to the collector.
 * Messages are passed as {topic, payload} objects without parsing.
 * Creates MQTT client internally. Supports comma-separated topic patterns.
 *
 * @example
 * const source = mqttSource('mqtt://localhost:1883', 'sensors/#,devices/#', collector);
 * source.start();
 * // ... later
 * source.stop();
 *
 * @param {string} url - MQTT broker URL (e.g., 'mqtt://localhost:1883')
 * @param {string} topics - Comma-separated MQTT topic patterns to subscribe
 * @param {object} collector - Collector with accept() method receiving {topic, payload}
 * @param {object} [options] - Optional MQTT connection options
 * @param {string} [options.clientId] - Client ID for persistent sessions
 * @param {number} [options.sessionExpiryInterval] - Session expiry in seconds (default 3600)
 * @returns {object} Source with start() and stop() methods
 */
export default function mqttSource(url, topics, collector, options = {}) {
  if (typeof url !== 'string' || url.length === 0) {
    throw new Error('URL must be a non-empty string');
  }
  if (typeof topics !== 'string' || topics.length === 0) {
    throw new Error('Topic must be a non-empty string');
  }
  if (!collector || typeof collector.accept !== 'function') {
    throw new Error('Collector must have an accept() method');
  }
  const list = topics.split(',').map((t) => t.trim()).filter((t) => t.length > 0);
  let state = idle();
  return {
    /**
     * Starts subscribing to the MQTT topics.
     */
    start() {
      if (state.subscribed()) {
        return;
      }
      const client = mqtt.connect(url, {
        clientId: options.clientId,
        clean: options.clientId ? false : true,
        protocolVersion: 5,
        properties: options.clientId ? {
          sessionExpiryInterval: options.sessionExpiryInterval || 3600
        } : undefined
      });
      const handler = (t, message) => {
        collector.accept({ topic: t, payload: message.toString() });
      };
      client.on('message', handler);
      client.on('connect', () => {
        client.subscribe(list, { qos: options.clientId ? 1 : 0 });
      });
      state = subscribed(client, handler);
    },
    /**
     * Stops subscribing to the MQTT topics.
     */
    stop() {
      if (!state.subscribed()) {
        return;
      }
      const client = state.client();
      client.unsubscribe(list);
      client.off('message', state.handler());
      client.end();
      state = idle();
    }
  };
}
