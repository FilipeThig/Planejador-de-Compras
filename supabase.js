const { createClient } = window.supabase;

const SUPABASE_URL = 'https://oohbbgdnwziubsspuyxr.supabase.co';
const SUPABASE_KEY = 'sb_publishable_aOCLdAfdNTeFCv-hz2lugg_zetK65RH';

const supabaseClient = createClient(
    SUPABASE_URL,
    SUPABASE_KEY
);