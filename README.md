# Raíz — Root Cause Intelligence

Sistema de inteligencia para el análisis de causa raíz en manufactura industrial. SaaS multi-tenant: cada empresa (tenant) gestiona sus propias OCCs (Ocurrencias — el objeto central del análisis), con un flujo guiado de Ishikawa 6M + 5 Porqués, revisión/aprobación, seguimiento de acciones y mediciones, y exportación a PDF.

## Arquitectura

- **Frontend**: SPA estática sin framework ni build step — JS vanilla que renderiza todo vía `innerHTML` sobre un estado global en memoria (`APP`).
  - `index.html` — shell HTML, metadata, PWA manifest inline, carga de fuentes y de `jspdf` por CDN.
  - `styles.css` — todos los estilos (tema dark/light vía variables CSS).
  - `app.js` — toda la lógica de la aplicación (estado, llamadas a la API, wizard de creación de OCC, dashboard, PDF, notificaciones, service worker).
- **Backend**: no vive en este repo. Es una Supabase Edge Function (`raiz-api`) que intermedia **todo** el acceso a las tablas — el navegador nunca las toca directamente. El frontend le pega vía `fetch` a `SUPA_URL + '/functions/v1/raiz-api'` (podés overridear con `window.RAIZ_API_URL` antes de cargar `app.js`, por ejemplo para apuntar a un entorno de staging).
- **Auth**: token propio (no es el auth nativo de Supabase) guardado en `localStorage` (prefijo `raiz_app_`), enviado como header `x-raiz-token`.
- **Multi-tenancy**: el tenant se deriva del dominio del email del usuario (`getTenantDomain()`).
- **Offline/PWA**: service worker generado dinámicamente vía Blob URL (no es un archivo `sw.js` separado) — esto es intencional para que la app funcione también abierta como archivo local (`file://`), sin depender de un server.

## Correr local

No hay build step. Alcanza con servir los 3 archivos estáticos:

```bash
npx serve .
```

o directamente abriendo `index.html` con doble clic (modo `file://`, soportado intencionalmente).

Por defecto pega contra el backend de producción (`SUPA_URL` hardcodeado en `app.js`). Para apuntar a otro entorno, definí `window.RAIZ_API_URL` antes de que cargue `app.js` (por ejemplo agregando un `<script>window.RAIZ_API_URL='...'</script>` justo antes del `<script src="app.js">` en `index.html`, sin commitear ese cambio).

## Estado del proyecto

- Sin tests automatizados ni linter todavía.
- Sin CI/CD: el deploy actual (Vercel/Netlify) no está conectado a este repo — ver roadmap.
- Sin separación de entornos (dev/staging/prod comparten el mismo backend de Supabase).

## Roadmap

Ver conversación de planificación técnica (no versionada todavía en este repo). Fases en curso: conectar CI/CD al deploy existente, tests mínimos, auditoría de seguridad multi-tenant, documentación de arquitectura.
