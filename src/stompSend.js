import stompit from 'stompit';

/**
 * Builds STOMP connect options from a URL.
 *
 * @param {URL} parsed - Parsed URL object
 * @param {object} options - Connection options
 * @returns {object} stompit connect parameters
 */
function connectParams(parsed, options) {
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
 * One-shot STOMP publish of a JSON payload to a destination.
 *
 * Connects, sends one MESSAGE frame, disconnects. For operator decisions
 * and other low-volume outbound events.
 *
 * @example
 * await stompSend('stomp://rabbitmq:61613', '/exchange/scada.user_decisions',
 *   { machine: 'icht2', start: 1700000000, user: 'hmi', tags: ['heating'] },
 *   { login: 'guest', passcode: 'guest', host: '/' });
 *
 * @param {string} url - STOMP broker URL
 * @param {string} destination - STOMP destination
 * @param {object|string} payload - JSON-serializable body or raw string
 * @param {object} [options] - STOMP connection options
 * @param {string} [options.login] - Login
 * @param {string} [options.passcode] - Passcode
 * @param {string} [options.host] - Virtual host header
 * @returns {Promise<void>} Resolves when the frame is sent and client disconnects
 */
export default function stompSend(url, destination, payload, options = {}) {
    if (typeof url !== 'string' || url.length === 0) {
        throw new Error('URL must be a non-empty string');
    }
    if (typeof destination !== 'string' || destination.length === 0) {
        throw new Error('Destination must be a non-empty string');
    }
    const parsed = new URL(url);
    const params = connectParams(parsed, options);
    const body = typeof payload === 'string' ? payload : JSON.stringify(payload);
    return new Promise((resolve, reject) => {
        stompit.connect(params, (error, client) => {
            if (error) {
                reject(error);
                return;
            }
            const frame = client.send({
                destination,
                'content-type': 'application/json'
            });
            frame.end(body);
            client.disconnect((disconnectError) => {
                if (disconnectError) {
                    reject(disconnectError);
                    return;
                }
                resolve();
            });
        });
    });
}
