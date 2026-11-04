import { positive, validateConnections } from './opcua/config.js';
export { validateConnections } from './opcua/config.js';

/** Independent OPC UA endpoints delivering opaque channel metadata and values. */
export default function opcuaSource(connections, collector, options = {}) {
    const settings = { retryMs: 1000, connectTimeoutMs: 5000, requestTimeoutMs: 5000, ...options };
    validateConnections(connections);
    if (!collector || typeof collector.accept !== 'function') {
        throw new TypeError('Collector must have an accept() method');
    }
    ['retryMs', 'connectTimeoutMs', 'requestTimeoutMs'].forEach((name) => { positive(settings[name], name); });
    let endpoints;
    let stopping = Promise.resolve();
    let revision = 0;
    return {
        async start() {
            revision += 1;
            const requested = revision;
            await stopping;
            // Importing the package or validating a factory never loads node-opcua.
            const { default: endpoint } = await import('./opcua/endpoint.js');
            if (requested === revision) {
                endpoints ??= connections.map((connection) => {
                    return endpoint(connection, (channel, value) => { return collector.accept({ channel, value }); }, settings);
                });
                endpoints.forEach((item) => { item.start(); });
            }
        },
        stop() {
            revision += 1;
            stopping = Promise.all((endpoints ?? []).map((item) => { return item.stop(); }));
            return stopping;
        }
    };
}
