/** Budget leases belong to actual acceptance, never to a timeout wrapper. */
export default async function budgetAccept(collector, record, bytes, options, context) {
    const release = options.budget?.reserve({ bytes, records: 1 });
    try { return await collector.accept(record, context); }
    finally { release?.(); }
}
