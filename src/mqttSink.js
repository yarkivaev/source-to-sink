import mqtt from 'mqtt';

/**
 * Idle state for MQTT sink.
 *
 * @returns {object} State with connected() returning false
 */
function idle() {
  return {
    connected() {
      return false;
    }
  };
}

/**
 * Connected state for MQTT sink.
 *
 * @param {object} client - MQTT client
 * @returns {object} State with connected() returning true
 */
function connected(client) {
  return {
    connected() {
      return true;
    },
    publish(topic, payload, qos) {
      client.publish(topic, payload, { qos });
    },
    disconnect() {
      client.end();
    }
  };
}

/**
 * MQTT sink for publishing records to MQTT topics.
 *
 * Each record must have a topic and payload field.
 * Creates an MQTT client internally and manages the connection.
 *
 * @example
 * const sink = mqttSink('mqtt://localhost:1883');
 * sink.start();
 * sink.write([{ topic: 'sensors/temp', payload: '42.5' }]);
 * sink.stop();
 *
 * @param {string} url - MQTT broker URL (e.g., 'mqtt://localhost:1883')
 * @param {object} [options] - Optional MQTT connection options
 * @param {string} [options.clientId] - Client ID for the connection
 * @param {number} [options.qos] - QoS level for publishing (default 0)
 * @returns {object} Sink with write(), start(), and stop() methods
 */
export default function mqttSink(url, options = {}) {
  if (typeof url !== 'string' || url.length === 0) {
    throw new Error('URL must be a non-empty string');
  }
  const qos = options.qos || 0;
  let state = idle();
  return {
    /**
     * Writes records to MQTT topics.
     *
     * @param {Array} records - Array of {topic, payload} records
     */
    write(records) {
      if (!state.connected()) {
        throw new Error('Sink is not connected');
      }
      for (const record of records) {
        state.publish(record.topic, record.payload, qos);
      }
    },
    /**
     * Connects to the MQTT broker.
     */
    start() {
      if (state.connected()) {
        return;
      }
      const client = mqtt.connect(url, {
        clientId: options.clientId,
        protocolVersion: 5
      });
      state = connected(client);
    },
    /**
     * Disconnects from the MQTT broker.
     */
    stop() {
      if (!state.connected()) {
        return;
      }
      state.disconnect();
      state = idle();
    }
  };
}
