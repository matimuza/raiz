// Smoke tests mínimos: no pegan contra el backend real (Supabase) — la
// llamada a raiz-api se mockea en memoria. El objetivo es atrapar roturas
// de carga/render (JS que tira excepción, HTML mal armado, etc.), no
// probar reglas de negocio del backend.
import { test, expect } from '@playwright/test';

test('la pantalla de login carga sin errores de consola', async ({ page }) => {
  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(String(err)));

  await page.goto('/');

  await expect(page.locator('#f-email')).toBeVisible();
  await expect(page.locator('#f-pass')).toBeVisible();
  await expect(page.locator('#login-form button[type="submit"]')).toBeVisible();

  expect(consoleErrors).toEqual([]);
});

test('login + carga de datos renderiza el dashboard', async ({ page }) => {
  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(String(err)));

  // Mockea el único endpoint del backend (raiz-api) para no depender de
  // Supabase real. Responde distinto según el "action" del body.
  await page.route('**/functions/v1/raiz-api', async (route) => {
    const body = route.request().postDataJSON();
    if (body.action === 'login') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          token: 'test-token',
          user: { id: 1, name: 'Usuario de Prueba', email: body.email, plan: 'free' },
          tenant: { id: 1, domain: 'test.com' },
        }),
      });
    }
    if (body.action === 'boot') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: { id: 1, name: 'Usuario de Prueba', email: 'test@test.com', plan: 'free' },
          tenant: { id: 1, domain: 'test.com' },
          users: [],
          occs: [],
          notifs: [],
        }),
      });
    }
    return route.fulfill({ status: 404, body: '{}' });
  });

  await page.goto('/');
  await page.fill('#f-email', 'test@test.com');
  await page.fill('#f-pass', 'password123');
  await page.locator('#login-form button[type="submit"]').click();

  await expect(page.locator('.btn-new-occ')).toBeVisible();
  await expect(page.locator('.sidebar')).toBeVisible();

  expect(consoleErrors).toEqual([]);
});
