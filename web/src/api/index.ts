// Public surface of the data layer. Query hooks (useFeed, usePost, …) are
// added here from step 5 onwards; no screen fetches data in the scaffold.
export { getSupabase, hasSupabaseConfig } from './supabase';
export { createQueryClient } from './queryClient';
