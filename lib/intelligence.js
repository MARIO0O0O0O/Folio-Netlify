// lib/intelligence.js — Career Market Intelligence Logic
import { supabaseClient as supabase } from './supabase.js';

/**
 * Calculates a user's market value increase if they add a specific skill.
 */
export async function calculateSkillPremium(roleTitle, currentSkills) {
  const { data: benchmark } = await supabase
    .from('market_benchmarks')
    .select('*')
    .eq('role_title', roleTitle)
    .single();

  if (!benchmark) return null;

  const potentialGains = [];
  const premiums = benchmark.skill_premiums;

  for (const [skill, multiplier] of Object.entries(premiums)) {
    if (!currentSkills.includes(skill)) {
      const dollarGain = Math.round(benchmark.avg_salary_min * multiplier);
      potentialGains.push({ skill, dollarGain, percentage: (multiplier * 100).toFixed(0) });
    }
  }

  return potentialGains.sort((a, b) => b.dollarGain - a.dollarGain);
}

/**
 * Performs a gap analysis between a user's profile and a target career path.
 */
export async function performGapAnalysis(sourceRole, targetRole, userSkills) {
  const { data: path } = await supabase
    .from('career_paths')
    .select('*')
    .eq('source_role', sourceRole)
    .eq('target_role', targetRole)
    .single();

  if (!path) {
    // Fallback logic for dynamic mapping if no direct path exists
    return {
      matchScore: 45,
      missingSkills: ['Domain Knowledge', 'Technical Certs'],
      resources: [{ title: 'Explore O*NET Online', url: 'https://onetonline.org' }]
    };
  }

  const userSkillSet = new Set(userSkills.map(s => s.toLowerCase()));
  const matched = path.transferable_skills.filter(s => userSkillSet.has(s.toLowerCase()));
  const missing = path.required_gap_skills.filter(s => !userSkillSet.has(s.toLowerCase()));
  
  const score = Math.round((matched.length / (matched.length + missing.length)) * 100);

  return {
    matchScore: score,
    missingSkills: missing,
    transferable: matched,
    resources: path.bridge_resources
  };
}

/**
 * Fetches safety radar data for a specific sector.
 */
export async function getSafetyRadar(sector) {
  const { data } = await supabase
    .from('market_benchmarks')
    .select('role_title, risk_score, growth_outlook')
    .eq('sector', sector);
  
  return data;
}
