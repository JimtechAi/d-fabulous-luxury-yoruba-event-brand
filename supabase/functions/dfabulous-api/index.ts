// Supabase Edge Function entrypoint. The application itself lives in app.ts so it can be
// exercised by tests without starting a server. See app.ts for routing, CORS and auth notes.
import { app } from './app.ts';

Deno.serve(app.fetch);
