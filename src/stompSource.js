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

/**
 * Builds settle helpers for one STOMP frame.
 *
 * @param {object} channel - STOMP channel
 * @param {object} message - STOMP frame
 * @returns {{ ack: Function, nack: Function }}
 */
function settleOf(channel, message) {
  return {
    ack() {
      channel.ack(message);
    },
    nack() {
      channel.nack(message);
    }
  };
}

/**
 * Delivers one STOMP body to the collector and settles the frame.
 *
 * @param {object} ctx - delivery context with channel/message/destination/collector/manualAck
 * @param {string} body - UTF-8 payload
 * @returns {Promise<void>}
 */
async function deliver(ctx, body) {
  const settle = settleOf(ctx.channel, ctx.message);
  try {
    await ctx.collector.accept({ destination: ctx.destination, payload: body, settle });
    if (!ctx.manualAck) {
      settle.ack();
    }
  } catch (error) {
    if (!ctx.manualAck) {
      settle.nack();
    }
    throw error;
  }
}

/**
 * Ignores a rejected delivery promise when running non-serial.
 *
 * @param {Error} error - rejected reason
 * @returns {undefined}
 */
function ignoreDelivery(error) {
  return error;
}

/**
 * Subscribes a channel and routes frames to the collector.
 *
 * @param {object} channel - STOMP channel
 * @param {string} destination - queue destination
 * @param {object} collector - message collector
 * @param {boolean} serial - global serial delivery
 * @param {boolean} manualAck - collector settles frames
 * @returns {undefined}
 */
function bind(channel, destination, collector, serial, manualAck) {
  let pending = Promise.resolve();
  channel.subscribe({ destination, ack: 'client-individual' }, (err, message) => {
    if (err) { return; }
    message.readString('utf-8', (readErr, body) => {
      if (readErr) { return; }
      const ctx = { channel, message, destination, collector, manualAck };
      function work() {
        return deliver(ctx, body.toString());
      }
      if (serial) {
        pending = pending.then(work, work);
      } else {
        void work().catch(ignoreDelivery);
      }
    });
  });
}

/**
 * STOMP subscription source for streaming messages to a collector.
 *
 * Messages are `{destination, payload, settle}`. Default ack-after-accept;
 * with `manualAck` the collector owns settle. With `serial: false`
 * deliveries are not globally sequenced.
 *
 * @param {string} url - STOMP broker URL
 * @param {string} destination - STOMP destination
 * @param {object} collector - Collector with accept()
 * @param {object} [options] - Connection and delivery options
 * @returns {object} Source with start() and stop() methods
 */
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
  const serial = options.serial !== false;
  const manualAck = options.manualAck === true;
  let state = idle();
  return {
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
      bind(channel, destination, collector, serial, manualAck);
      state = subscribed(channel);
    },
    stop() {
      if (!state.subscribed()) {
        return;
      }
      state.channel().close();
      state = idle();
    }
  };
}
