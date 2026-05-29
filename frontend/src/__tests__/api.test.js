import { describe, it, expect, vi, beforeEach } from 'vitest';
import { api } from '../api';

function makeFile(name, content = 'data') {
  return new File([content], name, { type: 'text/plain' });
}

function sseBody(events) {
  const text = events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('');
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(text));
      controller.close();
    },
  });
}

describe('api.sendMessageStream', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  it('posts FormData with content and files', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      body: sseBody([{ type: 'complete' }]),
    });

    const onEvent = vi.fn();
    await api.sendMessageStream(
      'cid',
      'hello',
      [makeFile('a.txt'), makeFile('b.txt')],
      onEvent,
    );

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toContain('/api/conversations/cid/message/stream');
    expect(options.method).toBe('POST');
    expect(options.body).toBeInstanceOf(FormData);
    expect(options.body.get('content')).toBe('hello');
    const files = options.body.getAll('files');
    expect(files).toHaveLength(2);
    expect(files[0].name).toBe('a.txt');
    expect(files[1].name).toBe('b.txt');
  });

  it('emits parsed SSE events to the callback', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      body: sseBody([
        { type: 'stage1_start' },
        { type: 'stage1_complete', data: [{ model: 'm', response: 'r' }] },
        { type: 'complete' },
      ]),
    });

    const onEvent = vi.fn();
    await api.sendMessageStream('cid', 'q', [], onEvent);

    expect(onEvent.mock.calls.map((c) => c[0])).toEqual([
      'stage1_start',
      'stage1_complete',
      'complete',
    ]);
    expect(onEvent.mock.calls[1][1].data[0].model).toBe('m');
  });

  it('throws when the server returns non-OK', async () => {
    global.fetch.mockResolvedValue({ ok: false, status: 500 });
    await expect(
      api.sendMessageStream('cid', 'q', [], vi.fn())
    ).rejects.toThrow(/Failed to send message/);
  });

  it('sends empty files field when called with no files', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      body: sseBody([{ type: 'complete' }]),
    });
    await api.sendMessageStream('cid', 'just text', [], vi.fn());
    const fd = global.fetch.mock.calls[0][1].body;
    expect(fd.getAll('files')).toHaveLength(0);
    expect(fd.get('content')).toBe('just text');
  });
});
