import assert from 'node:assert';
import { describe, it, before, after } from 'mocha';
import { GenericContainer } from 'testcontainers';
import mqtt from 'mqtt';
import mqttSource from '../src/mqttSource.js';

describe('mqttSource integration', function() {
  let container;
  let client;
  let url;

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
    client = mqtt.connect(url);
    await new Promise((resolve, reject) => {
      client.on('connect', resolve);
      client.on('error', reject);
      setTimeout(() => reject(new Error('MQTT connection timeout')), 10000);
    });
  });

  after(async function() {
    this.timeout(30000);
    if (client) {
      client.end();
    }
    if (container) {
      await container.stop();
    }
  });

  it('receives message from mqtt broker', async function() {
    this.timeout(10000);
    const received = [];
    const topic = `sensors/${Math.random().toString(36).slice(2)}`;
    const collector = { accept: (record) => received.push(record) };
    const source = mqttSource(client, topic, collector);
    source.start();
    await new Promise((resolve) => setTimeout(resolve, 500));
    const record = { value: Math.random(), unit: `\u00b0C` };
    client.publish(topic, JSON.stringify(record));
    await new Promise((resolve) => setTimeout(resolve, 500));
    source.stop();
    assert.strictEqual(received.length >= 1, true, 'Should receive message from broker');
  });

  it('receives message with unicode content', async function() {
    this.timeout(10000);
    const received = [];
    const topic = `sensors/${Math.random().toString(36).slice(2)}`;
    const collector = { accept: (record) => received.push(record) };
    const source = mqttSource(client, topic, collector);
    source.start();
    await new Promise((resolve) => setTimeout(resolve, 500));
    const record = { name: `Тест${Math.random()}`, value: Math.random() };
    client.publish(topic, JSON.stringify(record));
    await new Promise((resolve) => setTimeout(resolve, 500));
    source.stop();
    assert.strictEqual(received.length >= 1, true, 'Should receive message with unicode');
  });

  it('stops receiving after stop is called', async function() {
    this.timeout(10000);
    const received = [];
    const topic = `sensors/${Math.random().toString(36).slice(2)}`;
    const collector = { accept: (record) => received.push(record) };
    const source = mqttSource(client, topic, collector);
    source.start();
    await new Promise((resolve) => setTimeout(resolve, 500));
    source.stop();
    const before = received.length;
    client.publish(topic, JSON.stringify({ value: Math.random() }));
    await new Promise((resolve) => setTimeout(resolve, 500));
    assert.strictEqual(received.length, before, 'Should not receive messages after stop');
  });
});
