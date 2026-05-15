// lib/supabase.js — Supabase client singleton

const SUPABASE_URL = "https://djyvigazxpbepifwslyt.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_OQCOL2jm5ECVfuxnPVB-ew_foytvX9P";

// Use a self-invoking function to keep the global scope clean if needed,
// but for static HTML, we can just attach it to window or export it.
const { createClient } = supabase; // Assumes Supabase SDK is loaded via CDN in HTML

export const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true
  }
});

window.supabase = supabaseClient;
