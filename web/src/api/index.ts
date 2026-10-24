// Public surface of the data layer. Screens import from here; nothing outside
// api/ calls Supabase directly (FOUNDATION §2).
export { getSupabase, hasSupabaseConfig, publicStorageUrl } from './supabase';
export { createQueryClient } from './queryClient';
export { recoverySignal } from './recovery';
export * from './auth';
export * from './profile';
export * from './notifications';
export * from './account';
export * from './posts';
export * from './postHooks';
export * from './boards';
export * from './boardHooks';
export * from './teams';
export * from './teamHooks';
export * from './moderation';
export * from './moderationHooks';
export * from './people';
export * from './peopleHooks';
export * from './notificationHooks';
export * from './products';
export * from './productHooks';
