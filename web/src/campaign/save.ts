export const CAMPAIGN_SAVE_KEY = "campaign-save";

export function readCampaignSave() {
  return localStorage.getItem(CAMPAIGN_SAVE_KEY);
}

export function writeCampaignSave(save: string) {
  localStorage.setItem(CAMPAIGN_SAVE_KEY, save);
}
