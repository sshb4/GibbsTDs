import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function setupSignup(respond = async () => ({ ok: true, json: async () => ({ message: 'Check your texts and reply YES within 15 minutes to confirm. You are not subscribed until you reply.' }) })) {
  const elements = new Map();
  for (const id of ['sms-form', 'sms-form-submit', 'sms-consent', 'sms-form-status', 'sms-phone', 'sms-turnstile']) {
    elements.set(id, { handlers: {}, dataset: {}, checked: false, value: '',
      addEventListener(event, handler) { this.handlers[event] = handler; },
      focus() {}, scrollIntoView() {}, getBoundingClientRect() { return { width: 320 }; }
    });
  }
  const get = id => elements.get(id);
  get('sms-form').reportValidity = () => true;
  get('sms-form').reset = () => { get('sms-consent').checked = false; get('sms-phone').value = ''; };
  const config = { apiBaseUrl: 'https://signup.example', turnstileSiteKey: 'test-key' };
  let challenge, resets = 0;
  const window = { WEMBY_ALERTS: config, GIBBS_ALERTS: config, addEventListener() {}, turnstile: {
    render(selector, options) { challenge = options; return 0; }, reset() { resets++; }
  } };
  const requests = [];
  const document = { getElementById: get, querySelectorAll: () => [], createElement: () => ({}), head: { append() {} } };
  vm.runInNewContext(readFileSync(new URL('../../alerts.js', import.meta.url), 'utf8'), {
    window, document, URL, AbortSignal, fetch: async (url, options) => {
      requests.push({ url, data: JSON.parse(options.body) });
      return respond();
    }
  });
  const submit = () => get('sms-form').handlers.submit({ preventDefault() {} });
  const ready = () => {
    window.onGibbsTurnstileReady();
    get('sms-phone').value = '(210) 555-0123';
    get('sms-phone').handlers.input();
    get('sms-consent').checked = true;
    get('sms-consent').handlers.change();
    challenge.callback('verified-token');
  };
  return { get, submit, ready, requests, window, challenge: () => challenge, resets: () => resets };
}

test('submit requires a phone, consent and verification; expiry disables it again', async () => {
  const { get, submit, requests, window, challenge } = setupSignup();
  const button = get('sms-form-submit');
  assert.equal(button.disabled, true);
  await submit();
  assert.equal(requests.length, 0);
  window.onGibbsTurnstileReady();
  challenge().callback('verified-token');
  assert.equal(button.disabled, true);
  get('sms-phone').value = '(210) 555-0123';
  get('sms-phone').handlers.input();
  assert.equal(button.disabled, true);
  get('sms-consent').checked = true;
  get('sms-consent').handlers.change();
  assert.equal(button.disabled, false);
  get('sms-phone').value = '123';
  get('sms-phone').handlers.input();
  assert.equal(button.disabled, true);
  get('sms-phone').value = '(210) 555-0123';
  get('sms-phone').handlers.input();
  assert.equal(button.disabled, false);
  get('sms-consent').checked = false;
  get('sms-consent').handlers.change();
  assert.equal(button.disabled, true);
  get('sms-consent').checked = true;
  get('sms-consent').handlers.change();
  challenge()['expired-callback']();
  assert.equal(button.disabled, true);
  await submit();
  assert.equal(requests.length, 0);
});

test('successful signup shows thanks and YES instructions, clears the form and prevents duplicate submits', async () => {
  let resolveRequest;
  const { get, submit, ready, requests, resets } = setupSignup(() => new Promise(resolve => { resolveRequest = resolve; }));
  ready();
  const pending = submit();
  assert.equal(get('sms-form-submit').disabled, true);
  assert.equal(get('sms-form-submit').textContent, 'Submitting…');
  assert.equal(get('sms-phone').disabled, true);
  assert.equal(get('sms-consent').disabled, true);
  await submit();
  assert.equal(requests.length, 1);
  resolveRequest({ ok: true, json: async () => ({ message: 'Check your texts and reply YES within 15 minutes to confirm.' }) });
  await pending;
  assert.deepEqual(requests, [{ url: 'https://signup.example/subscribe', data: {
    phone: '(210) 555-0123', consent: true, token: 'verified-token'
  } }]);
  assert.equal(get('sms-consent').checked, false);
  assert.equal(get('sms-phone').value, '');
  assert.equal(get('sms-form-status').dataset.state, 'success');
  assert.match(get('sms-form-status').textContent, /Thanks for submitting!.*reply YES within 15 minutes/);
  assert.equal(get('sms-form-submit').disabled, true);
  assert.equal(get('sms-phone').disabled, false);
  assert.equal(resets(), 1);
  get('sms-phone').value = '(210) 555-0124';
  get('sms-phone').handlers.input();
  assert.equal(get('sms-form-status').dataset.state, undefined);
  assert.match(get('sms-form-status').textContent, /consent box/);
});

test('failed signup keeps the phone and consent, shows the error, and requires a fresh security check', async () => {
  const { get, submit, ready, challenge } = setupSignup(async () => ({ ok: false, json: async () => ({ message: 'Please try again later.' }) }));
  ready();
  await submit();
  assert.equal(get('sms-form-status').dataset.state, 'error');
  assert.equal(get('sms-form-status').textContent, 'Please try again later.');
  assert.equal(get('sms-phone').value, '(210) 555-0123');
  assert.equal(get('sms-consent').checked, true);
  assert.equal(get('sms-form-submit').disabled, true);
  challenge().callback('fresh-token');
  assert.equal(get('sms-form-submit').disabled, false);
});
