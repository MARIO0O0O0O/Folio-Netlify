// lib/profiles.js — Profile and data fetching helpers
import { supabaseClient as supabase } from './supabase.js';

export async function getOwnProfile() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();
  
  if (error) throw error;
  return data;
}

export async function getPublicProfile(username) {
  const { data, error } = await supabase
    .from('profiles')
    .select(`
      *,
      projects (*),
      skills (*),
      experiences (*)
    `)
    .eq('username', username)
    .eq('is_public', true)
    .single();
  
  if (error) throw error;
  return data;
}

export async function updateProfile(updates) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', user.id)
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

export async function checkUsernameAvailable(username) {
  const { data } = await supabase
    .from('profiles')
    .select('username')
    .eq('username', username)
    .maybeSingle();
  
  return !data;
}
