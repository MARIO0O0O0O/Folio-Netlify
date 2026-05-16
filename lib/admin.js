// lib/admin.js — Admin management helpers
import { supabaseClient as supabase } from './supabase.js';

export async function generateInviteCode(code) {
  const { data, error } = await supabase
    .from('invite_codes')
    .insert({ code: code.toUpperCase(), status: 'active' })
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

export async function listAllInvites() {
  const { data, error } = await supabase
    .from('invite_codes')
    .select('*, profiles:used_by(username, full_name)')
    .order('created_at', { ascending: false });
  
  if (error) throw error;
  return data;
}

export async function validateCode(code) {
  const { data, error } = await supabase
    .from('invite_codes')
    .select('*')
    .eq('code', code.toUpperCase())
    .eq('status', 'active')
    .is('used_by', null)
    .maybeSingle();
  
  if (error) throw error;
  return !!data;
}

export async function useCode(code, userId) {
  const { error } = await supabase
    .from('invite_codes')
    .update({ used_by: userId, status: 'used' })
    .eq('code', code.toUpperCase());
  
  if (error) throw error;
}
