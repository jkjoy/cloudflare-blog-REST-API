import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { clearSettingsCache, normalizeGravatarBaseUrl } from '../utils'
import { authMiddleware, requireRole } from '../auth'

const settings = new Hono<AppEnv>()
const SENSITIVE_SETTING_KEYS = new Set([
  'comment_turnstile_secret_key',
  'resend_api_key',
  'webhook_secret'
])

const PUBLIC_SETTING_KEYS = new Set([
  'site_title',
  'site_description',
  'site_keywords',
  'site_author',
  'gravatar_base_url',
  'home_posts_per_page',
  'comment_turnstile_enabled',
  'comment_turnstile_site_key',
  'site_favicon',
  'site_logo',
  'site_notice',
  'social_telegram',
  'social_x',
  'social_mastodon',
  'social_email',
  'social_qq',
  'site_icp',
  'site_footer_text'
])

// 获取所有系统设置（管理员专用，密钥只返回配置状态）
settings.get('/admin', authMiddleware, requireRole('administrator'), async (c) => {
  try {
    const result = await c.env.DB.prepare(`
      SELECT setting_key, setting_value
      FROM site_settings
      ORDER BY setting_key
    `).all()

    // Never send stored credentials back to the browser.
    const settingsObj: Record<string, string> = {}
    for (const row of result.results) {
      const key = row.setting_key as string
      if (SENSITIVE_SETTING_KEYS.has(key)) {
        settingsObj[`${key}_configured`] = String(row.setting_value || '').trim() ? '1' : '0'
        continue
      }
      settingsObj[key] = row.setting_value as string
    }

    return c.json(settingsObj)
  } catch (error) {
    console.error('Error fetching settings:', error)
    return c.json({ error: 'Failed to fetch settings' }, 500)
  }
})

// 获取所有系统设置（公开，不含敏感字段）
settings.get('/', async (c) => {
  try {
    const result = await c.env.DB.prepare(`
      SELECT setting_key, setting_value
      FROM site_settings
      ORDER BY setting_key
    `).all()

    // 将结果转换为对象格式，只返回明确允许公开的字段
    const settingsObj: Record<string, string> = {}
    for (const row of result.results) {
      const key = row.setting_key as string
      if (PUBLIC_SETTING_KEYS.has(key)) {
        settingsObj[key] = row.setting_value as string
      }
    }

    return c.json(settingsObj)
  } catch (error) {
    console.error('Error fetching settings:', error)
    return c.json({ error: 'Failed to fetch settings' }, 500)
  }
})

// 获取单个公开设置
settings.get('/:key', async (c) => {
  try {
    const key = c.req.param('key')

    if (!PUBLIC_SETTING_KEYS.has(key)) {
      return c.json({ error: 'Setting not found' }, 404)
    }

    const result = await c.env.DB.prepare(`
      SELECT setting_value
      FROM site_settings
      WHERE setting_key = ?
    `).bind(key).first()

    if (!result) {
      return c.json({ error: 'Setting not found' }, 404)
    }

    return c.json({
      key,
      value: result.setting_value
    })
  } catch (error) {
    console.error('Error fetching setting:', error)
    return c.json({ error: 'Failed to fetch setting' }, 500)
  }
})

// 更新系统设置（仅管理员）
settings.put('/', authMiddleware, requireRole('administrator'), async (c) => {
  try {
    const body = await c.req.json()

    // 批量更新设置
    const updates = Object.entries(body)

    for (const [key, value] of updates) {
      if (SENSITIVE_SETTING_KEYS.has(key) && !String(value || '').trim()) {
        continue
      }

      const settingValue = key === 'gravatar_base_url'
        ? normalizeGravatarBaseUrl(value)
        : value as string

      await c.env.DB.prepare(`
        INSERT INTO site_settings (setting_key, setting_value, updated_at)
        VALUES (?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(setting_key) DO UPDATE SET
          setting_value = excluded.setting_value,
          updated_at = CURRENT_TIMESTAMP
      `).bind(key, settingValue).run()
    }

    // Clear settings cache
    clearSettingsCache()

    return c.json({
      success: true,
      message: 'Settings updated successfully'
    })
  } catch (error) {
    console.error('Error updating settings:', error)
    return c.json({ error: 'Failed to update settings' }, 500)
  }
})

// 更新单个设置（仅管理员）
settings.put('/:key', authMiddleware, requireRole('administrator'), async (c) => {
  try {
    const key = c.req.param('key') || ''
    const { value } = await c.req.json()
    if (SENSITIVE_SETTING_KEYS.has(key) && !String(value || '').trim()) {
      return c.json({ error: 'Sensitive settings cannot be replaced with an empty value' }, 400)
    }

    const settingValue = key === 'gravatar_base_url'
      ? normalizeGravatarBaseUrl(value)
      : value

    await c.env.DB.prepare(`
      INSERT INTO site_settings (setting_key, setting_value, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(setting_key) DO UPDATE SET
        setting_value = excluded.setting_value,
        updated_at = CURRENT_TIMESTAMP
    `).bind(key, settingValue).run()

    // Clear settings cache
    clearSettingsCache()

    return c.json({
      success: true,
      key,
      value: SENSITIVE_SETTING_KEYS.has(key) ? undefined : settingValue,
      configured: SENSITIVE_SETTING_KEYS.has(key) ? !!String(settingValue || '').trim() : undefined
    })
  } catch (error) {
    console.error('Error updating setting:', error)
    return c.json({ error: 'Failed to update setting' }, 500)
  }
})

export default settings
