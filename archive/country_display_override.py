import frappe
from frappe.translate import MERGED_TRANSLATION_KEY, get_all_translations, change_translation_version

def ensure_ar_country_label():
    if frappe.local.site != 'archive.localhost' or frappe.local.lang != 'ar':
        return
    custom_translation = frappe.db.get_value(
        'Translation',
        {'language': 'ar', 'source_text': 'Hong Kong'},
        'translated_text',
    )
    target_label = custom_translation or 'هونغ كونغ - الصين'
    t = frappe.cache.hget(MERGED_TRANSLATION_KEY, 'ar')
    if t is None:
        t = get_all_translations('ar')
    if t.get('Hong Kong') != target_label:
        t = dict(t)
        t['Hong Kong'] = target_label
        frappe.cache.hset(MERGED_TRANSLATION_KEY, 'ar', t)
        change_translation_version()
