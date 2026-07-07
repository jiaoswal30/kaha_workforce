import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Copy .env.example to .env and fill in your Supabase project credentials.'
  )
}

// Untyped client: this supabase-js version's generic Database typing requires
// matching an internal (and fast-moving) postgrest-js shape exactly. We keep
// our own domain interfaces in types/database.ts and cast at call sites
// instead of fighting that generic surface.
export const supabase = createClient(supabaseUrl, supabaseAnonKey)
