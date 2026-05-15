// lib/media.js — Storage and media helpers
import { supabaseClient as supabase } from './supabase.js';

export async function uploadAvatar(file) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const ext = file.name.split('.').pop();
  const path = `${user.id}/avatar-${Date.now()}.${ext}`;

  const { data, error } = await supabase.storage
    .from('avatars')
    .upload(path, file, { upsert: true, contentType: file.type });

  if (error) throw error;

  const { data: { publicUrl } } = supabase.storage
    .from('avatars')
    .getPublicUrl(path);

  // Update profile with new URL
  const { error: updateError } = await supabase
    .from('profiles')
    .update({ avatar_url: publicUrl })
    .eq('id', user.id);
  
  if (updateError) throw updateError;

  return publicUrl;
}

export async function uploadResume(file) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const ext = file.name.split('.').pop();
  const path = `${user.id}/resume-${Date.now()}.${ext}`;

  const { data, error } = await supabase.storage
    .from('resumes')
    .upload(path, file, { upsert: true, contentType: file.type });

  if (error) throw error;

  const { data: { publicUrl } } = supabase.storage
    .from('resumes')
    .getPublicUrl(path);

  // Update profile with resume link (re-using website_url or adding a new field)
  // For now, let's return the URL so the UI can decide where to save it
  return publicUrl;
}
