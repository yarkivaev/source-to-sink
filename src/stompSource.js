import stompit from 'stompit';

/**
 * Idle state for STOMP source.
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
 * Subscribed state for STOMP source.
 *
 * @param {object} channel - STOMP channel
 * @returns {object} State with subscribed() returning true
 */
function subscribed(channel) {
  return {
    subscribed() {
      return true;
    },
    channel() {
      return channel;
    }
  };
}

/**
 * STOMP subscription source for streaming messages to a collector.
 *
 * Subscribes to a STOMP destination and forwards raw messages to the collector.
 * Messages are passed as {destination, payload} objects without parsing.
 * Uses ConnectFailover for automatic reconnection with exponential backoff
 * and Channel for transparent re-subscription. Acknowledges messages only
 * after the collector has accepted them.
 *
 * @example
 * const source = stompSource('stomp://localhost:61613', '/queue/sensors', collector);
 * source.start();
 * // ... later
 * source.stop();
 *
 * @param {string} url - STOMP broker URL (e.g., 'stomp://localhost:61613')
 * @param {string} destination - STOMP destination to subscribe (e.g., '/queue/sensors')
 * @param {object} collector - Collector with accept() method receiving {destination, payload}
 * @param {object} [options] - Optional STOMP connection options
 * @param {string} [options.login] - Login for STOMP auth
 * @param {string} [options.passcode] - Passcode for STOMP auth
 * @param {string} [options.host] - Virtual host for STOMP connection
 * @returns {object} Source with start() and stop() methods
 */
/**
 * Builds STOMP server configuration from a URL.
 *
 * @param {URL} parsed - Parsed URL object
 * @param {object} options - Connection options
 * @returns {object} Server config for ConnectFailover
 */
function serverConfig(parsed, options) {
  return {
    host: parsed.hostname,
    port: parseInt(parsed.port, 10) || 61613,
    connectHeaders: {
      host: options.host || parsed.hostname,
      login: options.login || '',
      passcode: options.passcode || ''
    }
  };
}

export default function stompSource(url, destination, collector, options = {}) {
  if (typeof url !== 'string' || url.length === 0) {
    throw new Error('URL must be a non-empty string');
  }
  if (typeof destination !== 'string' || destination.length === 0) {
    throw new Error('Destination must be a non-empty string');
  }
  if (!collector || typeof collector.accept !== 'function') {
    throw new Error('Collector must have an accept() method');
  }
  const parsed = new URL(url);
  let state = idle();
  return {
    /**
     * Starts subscribing to the STOMP destination.
     */
    start() {
      if (state.subscribed()) {
        return;
      }
      const failover = new stompit.ConnectFailover([serverConfig(parsed, options)], {
        initialReconnectDelay: 10,
        maxReconnectDelay: 30000,
        maxReconnects: -1
      });
      const channel = new stompit.Channel(failover);
      const subscribe = { destination, ack: 'client-individual' };
      channel.subscribe(subscribe, (err, message) => {
        if (err) { return; }
        message.readString('utf-8', async (readErr, body) => {
          if (readErr) { return; }
          try {
            await collector.accept({ destination, payload: body.toString() });
            channel.ack(message);
          } catch { channel.nack(message); }
        });
      });
      state = subscribed(channel);
    },
    /**
     * Stops subscribing to the STOMP destination.
     */
    stop() {
      if (!state.subscribed()) {
        return;
      }
      state.channel().close();
      state = idle();
    }
  };
}
