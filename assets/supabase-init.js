// Supabase configuration and initialization
const SUPABASE_URL = "https://djyvigazxpbepifwslyt.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_OQCOL2jm5ECVfuxnPVB-ew_foytvX9P";

// Initialize the Supabase client
const supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

window.supabaseClient = supabase;
