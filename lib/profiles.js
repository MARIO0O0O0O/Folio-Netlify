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

// Projects
export async function listOwnProjects() {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('projects')
    .select('*, project_media(*)')
    .eq('user_id', user.id)
    .order('display_order', { ascending: true });
  if (error) throw error;
  return data;
}

export async function createProject(projectData) {
  const { data: { user } } = await supabase.auth.getUser();
  const slug = projectData.title.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  const { data, error } = await supabase
    .from('projects')
    .insert({ ...projectData, user_id: user.id, slug })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Skills
export async function listOwnSkills() {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('skills')
    .select('*')
    .eq('user_id', user.id)
    .order('display_order', { ascending: true });
  if (error) throw error;
  return data;
}

export async function addSkill(name, category, proficiency = 'intermediate') {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('skills')
    .insert({ name, category, proficiency, user_id: user.id })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Experiences
export async function listOwnExperiences() {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('experiences')
    .select('*')
    .eq('user_id', user.id)
    .order('start_date', { ascending: false });
  if (error) throw error;
  return data;
}
