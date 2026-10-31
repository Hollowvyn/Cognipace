import { browser } from 'wxt/browser'

export async function openGooglePasswordManager() {
  // Open the manager only. Never include credentials in navigation data.
  await browser.tabs.create({ url: 'chrome://password-manager/passwords' })
}
