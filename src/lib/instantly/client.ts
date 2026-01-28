/**
 * Instantly.ai API Client (V2)
 * https://developer.instantly.ai/
 */

const INSTANTLY_API_BASE = "https://api.instantly.ai/v2";

export interface InstantlyCampaign {
  id: string;
  name: string;
  status: string;
  created_at: string;
}

export interface InstantlyLead {
  email: string;
  first_name?: string;
  last_name?: string;
  company_name?: string;
  personalization?: string;
  phone?: string;
  website?: string;
  custom_variables?: Record<string, string>;
}

export interface AddLeadResponse {
  status: string;
  lead_id?: string;
  message?: string;
}

/**
 * Helper to make V2 API requests with proper headers
 */
async function instantlyRequest(apiKey: string, endpoint: string, options: RequestInit = {}) {
  const url = endpoint.startsWith('http') ? endpoint : `${INSTANTLY_API_BASE}${endpoint}`;
  
  const headers = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${apiKey}`,
    ...options.headers,
  };

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || `Instantly API error: ${response.status}`);
  }

  return response.json();
}

/**
 * Test Instantly API connection
 */
export async function testInstantlyConnection(apiKey: string): Promise<{
  success: boolean;
  message: string;
}> {
  try {
    await instantlyRequest(apiKey, "/campaigns?limit=1");
    return {
      success: true,
      message: "Connected successfully",
    };
  } catch (error: any) {
    return {
      success: false,
      message: error.message || "Connection failed",
    };
  }
}

/**
 * Get all campaigns from Instantly
 */
export async function getCampaigns(apiKey: string): Promise<InstantlyCampaign[]> {
  const data = await instantlyRequest(apiKey, "/campaigns?limit=100");
  // V2 returns an array directly or inside a data field depending on the endpoint
  return Array.isArray(data) ? data : (data.campaigns || data.data || []);
}

/**
 * Add a single lead to a campaign
 */
export async function addLeadToCampaign(
  apiKey: string,
  campaignId: string,
  lead: InstantlyLead
): Promise<AddLeadResponse> {
  return instantlyRequest(apiKey, "/leads", {
    method: "POST",
    body: JSON.stringify({
      campaign_id: campaignId,
      skip_if_in_workspace: true,
      leads: [lead],
    }),
  });
}

/**
 * Add multiple leads to a campaign in bulk
 */
export async function addLeadsToCampaign(
  apiKey: string,
  campaignId: string,
  leads: InstantlyLead[]
): Promise<{ success: number; failed: number; errors: string[] }> {
  const results = {
    success: 0,
    failed: 0,
    errors: [] as string[],
  };

  const batchSize = 100;
  
  for (let i = 0; i < leads.length; i += batchSize) {
    const batch = leads.slice(i, i + batchSize);
    
    try {
      await instantlyRequest(apiKey, "/leads", {
        method: "POST",
        body: JSON.stringify({
          campaign_id: campaignId,
          skip_if_in_workspace: true,
          leads: batch,
        }),
      });
      results.success += batch.length;
    } catch (error: any) {
      results.failed += batch.length;
      results.errors.push(error.message);
    }

    if (i + batchSize < leads.length) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  return results;
}

/**
 * Get lead status from a campaign
 */
export async function getLeadStatus(
  apiKey: string,
  email: string
): Promise<{ status: string; campaign_id?: string } | null> {
  try {
    const data = await instantlyRequest(apiKey, `/leads?email=${encodeURIComponent(email)}`);
    return Array.isArray(data) ? data[0] : data;
  } catch {
    return null;
  }
}

/**
 * Delete a lead from Instantly
 */
export async function deleteLead(
  apiKey: string,
  campaignId: string,
  email: string
): Promise<boolean> {
  try {
    await instantlyRequest(apiKey, "/leads/delete", {
      method: "POST",
      body: JSON.stringify({
        campaign_id: campaignId,
        delete_list: [email],
      }),
    });
    return true;
  } catch {
    return false;
  }
}

// ==========================================
// Cadence Sequence Functions
// ==========================================

export interface LeadActivity {
  email: string;
  status: string;
  opened: boolean;
  open_count: number;
  replied: boolean;
  clicked: boolean;
  bounced: boolean;
  unsubscribed: boolean;
  last_opened_at?: string;
  last_replied_at?: string;
  emails_sent: number;
}

export interface CadenceLead extends InstantlyLead {
  industry?: string;
  title?: string;
  city?: string;
}

/**
 * Add a lead to campaign for cadence sequence
 */
export async function addLeadForCadence(
  apiKey: string,
  campaignId: string,
  lead: CadenceLead
): Promise<{ success: boolean; error?: string }> {
  try {
    await instantlyRequest(apiKey, "/leads", {
      method: "POST",
      body: JSON.stringify({
        campaign_id: campaignId,
        skip_if_in_workspace: true,
        leads: [{
          email: lead.email,
          first_name: lead.first_name || "",
          last_name: lead.last_name || "",
          company_name: lead.company_name || "",
          personalization: lead.personalization || lead.title || "there",
          phone: lead.phone || "",
          website: lead.website || "",
          custom_variables: {
            industry: lead.industry || "home services",
            title: lead.title || "Owner",
            city: lead.city || "",
            ...lead.custom_variables,
          },
        }],
      }),
    });
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Get lead activity/engagement data from Instantly
 */
export async function getLeadActivity(
  apiKey: string,
  email: string,
  campaignId?: string
): Promise<LeadActivity | null> {
  try {
    let endpoint = `/leads?email=${encodeURIComponent(email)}`;
    if (campaignId) {
      endpoint += `&campaign_id=${campaignId}`;
    }

    const data = await instantlyRequest(apiKey, endpoint);
    const lead = Array.isArray(data) ? data[0] : data;
    
    if (!lead) return null;

    return {
      email: lead.email || email,
      status: lead.status || "unknown",
      opened: lead.opened || lead.is_opened || false,
      open_count: lead.open_count || lead.opens || 0,
      replied: lead.replied || lead.is_replied || false,
      clicked: lead.clicked || lead.is_clicked || false,
      bounced: lead.bounced || lead.is_bounced || false,
      unsubscribed: lead.unsubscribed || lead.is_unsubscribed || false,
      last_opened_at: lead.last_opened_at || lead.opened_at,
      last_replied_at: lead.last_replied_at || lead.replied_at,
      emails_sent: lead.emails_sent || lead.sent_count || 0,
    };
  } catch {
    return null;
  }
}

/**
 * Batch get lead activities for multiple emails
 */
export async function batchGetLeadActivities(
  apiKey: string,
  emails: string[],
  campaignId?: string
): Promise<Map<string, LeadActivity>> {
  const results = new Map<string, LeadActivity>();
  const batchSize = 10;
  
  for (let i = 0; i < emails.length; i += batchSize) {
    const batch = emails.slice(i, i + batchSize);
    const promises = batch.map(email => getLeadActivity(apiKey, email, campaignId));
    const activities = await Promise.all(promises);
    
    batch.forEach((email, index) => {
      const activity = activities[index];
      if (activity) {
        results.set(email, activity);
      }
    });

    if (i + batchSize < emails.length) {
      await new Promise(resolve => setTimeout(resolve, 300));
    }
  }

  return results;
}

/**
 * Get campaign analytics summary
 */
export async function getCampaignAnalytics(
  apiKey: string,
  campaignId: string
): Promise<{
  sent: number;
  opened: number;
  replied: number;
  bounced: number;
  open_rate: number;
  reply_rate: number;
} | null> {
  try {
    const data = await instantlyRequest(apiKey, `/campaigns/${campaignId}`);
    
    const sent = data.sent || data.emails_sent || 0;
    const opened = data.opened || data.opens || 0;
    const replied = data.replied || data.replies || 0;
    const bounced = data.bounced || data.bounces || 0;

    return {
      sent,
      opened,
      replied,
      bounced,
      open_rate: sent > 0 ? Math.round((opened / sent) * 100) : 0,
      reply_rate: sent > 0 ? Math.round((replied / sent) * 100) : 0,
    };
  } catch {
    return null;
  }
}

/**
 * Sync email activity for contacts - returns updated activity data
 */
export async function syncEmailActivityForContacts(
  apiKey: string,
  campaignId: string,
  emails: string[]
): Promise<{
  synced: number;
  activities: Array<{
    email: string;
    opened: boolean;
    open_count: number;
    replied: boolean;
    last_opened_at?: string;
  }>;
}> {
  const activities = await batchGetLeadActivities(apiKey, emails, campaignId);
  
  const result: Array<{
    email: string;
    opened: boolean;
    open_count: number;
    replied: boolean;
    last_opened_at?: string;
  }> = [];

  activities.forEach((activity, email) => {
    result.push({
      email,
      opened: activity.opened,
      open_count: activity.open_count,
      replied: activity.replied,
      last_opened_at: activity.last_opened_at,
    });
  });

  return {
    synced: result.length,
    activities: result,
  };
}
