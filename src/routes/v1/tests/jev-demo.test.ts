import { OpenAPIHono } from '@hono/zod-openapi';
import { readFileSync } from 'fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { configureAuth } from '../../../app';
import { evaluateRequestSchema } from '../../../schemas/v1/evaluate';
import demo from '../demos/jev-demo';
import demos from '../demos/index';
import evaluate from '../evaluate';

describe('Jev playground', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('serves usable presets that conform to the evaluation contract', async () => {
    const response = await demo.handler.request('/');
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('text/html');
    const html = await response.text();
    const presetJson = html.match(/<script id="presetData" type="application\/json">([\s\S]*?)<\/script>/)?.[1];
    expect(presetJson).toBeDefined();
    const presets: { label: string; state: unknown; questions: unknown }[] = JSON.parse(presetJson!);
    expect(presets.map(preset => preset.label)).toEqual([
      'Agent Router', 'Support Ticket Triage', 'Travel Email Classification',
      'Prompt Injection Guard', 'PR Risk Review', 'Invoice Compliance',
    ]);
    const requests = presets.map(preset => evaluateRequestSchema.parse({
      payload: { state: preset.state, questions: preset.questions },
      config: { provider: 'typesafe' },
    }));
    expect(Object.values(requests[0].payload.questions).map(question => question.type).sort())
      .toEqual(['choice', 'noul', 'score']);
  });

  it('connects to the existing app navigation, theme, and key management', async () => {
    const directory = await (await demos.handler.request('/')).text();
    expect(directory).toContain('href="/api/v1/jev-demo"');
    const html = await (await demo.handler.request('/')).text();
    for (const href of ['/', '/api/demos', '/api/models', '/api/ui', '/admin']) {
      expect(html).toContain(`href="${href}"`);
    }
    expect(html).toContain('/api/shared/theme.css');
    expect(html).toContain('/api/shared/theme.js');
    expect(html).toContain("fetch('/api/v1/evaluate'");
  });

  it.each(['/api/v1/jev-demo', '/api/jev-demo'])(
    'keeps %s public while evaluation and admin writes require production authentication',
    async path => {
      vi.stubEnv('NODE_ENV', 'production');
      vi.stubEnv('DEFAULT_ACCESS_TOKEN', 'playground-test-token');
      const app = new OpenAPIHono();
      await configureAuth(app);
      app.route(path, demo.handler);
      app.route('/api/v1/evaluate', evaluate.handler);
      app.put('/api/v1/admin/keys/typesafe', c => c.json({ ok: true }));
      expect((await app.request(path)).status).toBe(200);
      expect((await app.request('/api/v1/evaluate', { method: 'POST' })).status).toBe(401);
      expect((await app.request('/api/v1/admin/keys/typesafe', { method: 'PUT' })).status).toBe(401);
      const authorized = await app.request('/api/v1/evaluate', {
        method: 'POST',
        headers: { Authorization: 'Bearer playground-test-token', 'Content-Type': 'application/json' },
        body: '{}',
      });
      expect(authorized.status).toBe(400);
    },
  );

  it('includes syntactically valid browser scripts', () => {
    const html = readFileSync('src/templates/jevDemo.html', 'utf8');
    const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
    expect(scripts.length).toBe(2);
    for (const script of scripts) expect(() => new Function(script[1])).not.toThrow();
  });
});
