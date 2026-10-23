export function renderErrorPage(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>TRACE — System Recovery</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="icon" href="/trace-icon.svg" type="image/svg+xml" />
    <style>
      body {
        font-family: 'Space Grotesk', system-ui, -apple-system, sans-serif;
        background: #0b0f19;
        color: #e2e8f0;
        display: grid;
        place-items: center;
        min-height: 100vh;
        margin: 0;
        padding: 1.5rem;
      }
      .card {
        max-width: 32rem;
        width: 100%;
        text-align: center;
        padding: 2.5rem 2rem;
        background: #111827;
        border: 1px solid #1f293d;
        border-radius: 0.5rem;
        box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);
      }
      .badge {
        display: inline-block;
        font-family: monospace;
        font-size: 0.75rem;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        color: #f59e0b;
        background: rgba(245, 158, 11, 0.1);
        border: 1px solid rgba(245, 158, 11, 0.3);
        padding: 0.25rem 0.75rem;
        border-radius: 9999px;
        margin-bottom: 1rem;
      }
      h1 {
        font-size: 1.5rem;
        font-weight: 600;
        margin: 0 0 0.5rem;
        color: #f8fafc;
      }
      p {
        color: #94a3b8;
        font-size: 0.875rem;
        line-height: 1.5;
        margin: 0 0 1.75rem;
      }
      .actions {
        display: flex;
        gap: 0.75rem;
        justify-content: center;
        flex-wrap: wrap;
      }
      a, button {
        padding: 0.6rem 1.25rem;
        border-radius: 0.375rem;
        font-size: 0.8125rem;
        font-weight: 500;
        cursor: pointer;
        text-decoration: none;
        transition: all 0.15s ease;
      }
      .primary {
        background: #0ea5e9;
        color: #04101e;
        border: 1px solid #38bdf8;
      }
      .primary:hover {
        background: #38bdf8;
      }
      .secondary {
        background: #1e293b;
        color: #e2e8f0;
        border: 1px solid #334155;
      }
      .secondary:hover {
        background: #334155;
      }
    </style>
  </head>
  <body>
    <div class="card">
      <span class="badge">TACTICAL SYSTEM RECOVERY</span>
      <h1>TRACE Command Gateway Interrupted</h1>
      <p>An unexpected SSR runtime fault occurred during session processing. The command shell state remains protected in local memory.</p>
      <div class="actions">
        <button class="primary" onclick="location.reload()">Reload Session</button>
        <a class="secondary" href="/">Return to Command Overview</a>
      </div>
    </div>
  </body>
</html>`;
}
