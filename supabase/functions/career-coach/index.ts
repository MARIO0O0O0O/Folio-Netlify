import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const XAI_API_KEY = Deno.env.get('XAI_API_KEY')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { messages, userId } = await req.json()

    // 1. Initialize Supabase Admin client
    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!)

    // 2. Fetch User Profile Context
    const { data: profile } = await supabase
      .from('profiles')
      .select('*, projects(*), skills(*), experiences(*)')
      .eq('id', userId)
      .single()

    // 3. Build System Prompt with Data Context
    const systemPrompt = `
      You are the FOLIO Career Coach, an elite AI assistant for high-performing professionals.
      Your tone is sophisticated, direct, and highly strategic (inspired by Grok).
      
      USER CONTEXT:
      - Name: ${profile?.full_name || 'Professional'}
      - Headline: ${profile?.headline || 'Not set'}
      - Bio: ${profile?.bio || 'No bio provided'}
      - Skills: ${profile?.skills?.map((s: any) => s.name).join(', ') || 'None listed'}
      - Projects: ${profile?.projects?.map((p: any) => p.title).join(', ') || 'None listed'}

      GOAL:
      Help the user improve their FOLIO profile, suggest career pivots, or prepare for interviews based on their specific data. 
      If they ask to "improve highlights", provide quantified, high-impact bullet points.
      If they ask for a "vault score", give them a tough but fair critique.
    `

    // 4. Call xAI (Grok) API
    const response = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${XAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'grok-beta', // Or grok-4.1-fast when available
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages
        ],
        stream: false, // Start with non-streaming for simplicity in prototype
      }),
    })

    const data = await response.json()
    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
