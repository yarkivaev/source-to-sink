import assert from 'node:assert';
import { after, before, describe, it } from 'mocha';
import { GenericContainer } from 'testcontainers';
import mqtt from 'mqtt';
import mqttSink from '../src/mqttSink.js';

describe('mqttSink integration', function() {
  let container;
  let url;
  let subscriber;

  before(async function() {
    this.timeout(120000);
    container = await new GenericContainer('eclipse-mosquitto:2')
      .withExposedPorts(1883)
      .withCommand(['mosquitto', '-c', '/mosquitto-no-auth.conf'])
      .withStartupTimeout(30000)
      .start();
    const host = container.getHost();
    const port = container.getMappedPort(1883);
    url = `mqtt://${host}:${port}`;
    subscriber = mqtt.connect(url);
    await new Promise((resolve, reject) => {
      subscriber.on('connect', resolve);
      subscriber.on('error', reject);
      setTimeout(() => { reject(new Error('MQTT connection timeout')); }, 10000);
    });
  });

  after(async function() {
    this.timeout(30000);
    if (subscriber) {
      subscriber.end();
    }
    if (container) {
      await container.stop();
    }
  });

  it('publishes records that subscriber receives', async function() {
    this.timeout(10000);
    const received = [];
    const topic = `sink/${Math.random().toString(36).slice(2)}`;
    subscriber.subscribe(topic);
    subscriber.on('message', (t, payload) => {
      received.push({ topic: t, payload: payload.toString() });
    });
    await new Promise((resolve) => { setTimeout(resolve, 1000); });
    const sink = mqttSink(url);
    sink.start();
    await new Promise((resolve) => { setTimeout(resolve, 1000); });
    const value = `${Math.random()}`;
    sink.write([{ topic, payload: value }]);
    await new Promise((resolve) => { setTimeout(resolve, 1000); });
    sink.stop();
    assert.strictEqual(received.length >= 1, true, 'Subscriber should receive published record');
  });

  it('publishes unicode payload', async function() {
    this.timeout(10000);
    const received = [];
    const topic = `юникод/${Math.random().toString(36).slice(2)}`;
    subscriber.subscribe(topic);
    subscriber.on('message', (t, payload) => {
      if (t === topic) {
        received.push(payload.toString());
      }
    });
    await new Promise((resolve) => { setTimeout(resolve, 1000); });
    const sink = mqttSink(url);
    sink.start();
    await new Promise((resolve) => { setTimeout(resolve, 1000); });
    const text = `Данные температуры ${Math.random()}`;
    sink.write([{ topic, payload: text }]);
    await new Promise((resolve) => { setTimeout(resolve, 1000); });
    sink.stop();
    assert.strictEqual(received.length >= 1, true, 'Subscriber should receive unicode payload');
  });

  it('does not publish after stop', async function() {
    this.timeout(10000);
    const received = [];
    const topic = `stopped/${Math.random().toString(36).slice(2)}`;
    subscriber.subscribe(topic);
    subscriber.on('message', (t, payload) => {
      if (t === topic) {
        received.push(payload.toString());
      }
    });
    await new Promise((resolve) => { setTimeout(resolve, 1000); });
    const sink = mqttSink(url);
    sink.start();
    await new Promise((resolve) => { setTimeout(resolve, 1000); });
    sink.stop();
    assert.throws(
      () => {return sink.write([{ topic, payload: `${Math.random()}` }])},
      /not connected/u,
      'Should throw when writing after stop'
    );
  });
});
