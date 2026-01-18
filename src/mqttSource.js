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
 * @param {function} handler - Message handler function
 * @returns {object} State with subscribed() returning true
 */
function subscribed(handler) {
  return {
    subscribed() {
      return true;
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
 *
 * @example
 * const source = mqttSource(mqttClient, 'sensors/#', collector);
 * source.start();
 * // ... later
 * source.stop();
 *
 * @param {object} client - MQTT client with subscribe(), on(), unsubscribe()
 * @param {string} topic - MQTT topic pattern to subscribe
 * @param {object} collector - Collector with accept() method
 * @returns {object} Source with start() and stop() methods
 */
export default function mqttSource(client, topic, collector) {
  if (!client || typeof client.subscribe !== 'function') {
    throw new Error('Client must have a subscribe() method');
  }
  if (!client || typeof client.on !== 'function') {
    throw new Error('Client must have an on() method');
  }
  if (!client || typeof client.unsubscribe !== 'function') {
    throw new Error('Client must have an unsubscribe() method');
  }
  if (!client || typeof client.off !== 'function') {
    throw new Error('Client must have an off() method');
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
      const handler = (t, message) => {
        if (t === topic || t.startsWith(topic.replace('#', '').replace('+', ''))) {
          const record = JSON.parse(message.toString());
          collector.accept(record);
        }
      };
      client.on('message', handler);
      client.subscribe(topic);
      state = subscribed(handler);
    },
    /**
     * Stops subscribing to the MQTT topic.
     */
    stop() {
      if (!state.subscribed()) {
        return;
      }
      client.unsubscribe(topic);
      client.off('message', state.handler());
      state = idle();
    }
  };
}
