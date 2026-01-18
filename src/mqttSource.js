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
 * Subscribes to an MQTT topic and forwards messages to the collector.
 * Messages are parsed as JSON before being passed to accept().
 * Creates MQTT client internally.
 *
 * @example
 * const source = mqttSource('mqtt://localhost:1883', 'sensors/#', collector);
 * source.start();
 * // ... later
 * source.stop();
 *
 * @param {string} url - MQTT broker URL (e.g., 'mqtt://localhost:1883')
 * @param {string} topic - MQTT topic pattern to subscribe
 * @param {object} collector - Collector with accept() method
 * @param {object} [options] - Optional MQTT connection options
 * @param {string} [options.clientId] - Client ID for persistent sessions
 * @param {number} [options.sessionExpiryInterval] - Session expiry in seconds (default 3600)
 * @returns {object} Source with start() and stop() methods
 */
export default function mqttSource(url, topic, collector, options = {}) {
  if (typeof url !== 'string' || url.length === 0) {
    throw new Error('URL must be a non-empty string');
  }
  if (typeof topic !== 'string' || topic.length === 0) {
    throw new Error('Topic must be a non-empty string');
  }
  if (!collector || typeof collector.accept !== 'function') {
    throw new Error('Collector must have an accept() method');
  }
  let state = idle();
  return {
    /**
     * Starts subscribing to the MQTT topic.
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
        if (t === topic || t.startsWith(topic.replace('#', '').replace('+', ''))) {
          const record = JSON.parse(message.toString());
          collector.accept(record);
        }
      };
      client.on('message', handler);
      client.on('connect', () => {
        client.subscribe(topic, { qos: options.clientId ? 1 : 0 });
      });
      state = subscribed(client, handler);
    },
    /**
     * Stops subscribing to the MQTT topic.
     */
    stop() {
      if (!state.subscribed()) {
        return;
      }
      const client = state.client();
      client.unsubscribe(topic);
      client.off('message', state.handler());
      client.end();
      state = idle();
    }
  };
}
