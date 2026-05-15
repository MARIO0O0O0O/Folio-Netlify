// lib/messaging.js — Inbox and messaging helpers
import { supabaseClient as supabase } from './supabase.js';

export async function sendMessage(recipientId, senderData) {
  const { error } = await supabase
    .from('contact_messages')
    .insert({
      recipient_id: recipientId,
      sender_name: senderData.name,
      sender_email: senderData.email,
      subject: senderData.subject || 'New FOLIO Inquiry',
      body: senderData.message,
      message_type: senderData.type || 'inquiry',
      metadata: senderData.metadata || {}
    });
  
  if (error) throw error;
  return true;
}

export async function listMyMessages() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('contact_messages')
    .select('*')
    .eq('recipient_id', user.id)
    .order('created_at', { ascending: false });
  
  if (error) throw error;
  return data;
}

export async function markMessageAsRead(messageId) {
  const { error } = await supabase
    .from('contact_messages')
    .update({ is_read: true })
    .eq('id', messageId);
  
  if (error) throw error;
}
