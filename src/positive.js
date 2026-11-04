export default function positive(value, name) {
    if (!Number.isFinite(value) || value <= 0) {
        throw new TypeError(`${name} must be a positive number`);
    }
}
