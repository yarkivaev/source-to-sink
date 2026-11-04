function failed(state, message) {
    if (state.active) {
        state.failure = new Error(message);
        state.wake?.();
    }
}
export function watchSubscription(state, subscription) {
    state.lastPublish = Date.now();
    state.subscription = subscription;
    subscription.on('keepalive', () => { state.lastPublish = Date.now(); });
    subscription.on('received_notifications', () => { state.lastPublish = Date.now(); });
    subscription.on('terminated', () => { failed(state, 'OPC UA subscription terminated'); });
    subscription.on('status_changed', (status) => {
        if (!status.isGood()) {
            failed(state, `OPC UA subscription status: ${status.toString()}`);
        }
    });
}
export function checkSubscription(state, options) {
    const { subscription } = state;
    const silence = Math.max(subscription.publishingInterval * subscription.maxKeepAliveCount * 3, options.requestTimeoutMs);
    if (Date.now() - state.lastPublish > silence) {
        failed(state, 'OPC UA subscription stopped publishing');
    }
    if (state.failure) {
        throw state.failure;
    }
}
