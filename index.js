/**
 * Lorebook Sync вЂ” SillyTavern extension
 * Syncs lorebooks, characters, personas and chats to Notion databases.
 *
 * v0.2: four independent categories, each with its own Notion database.
 */

import { extension_settings, getContext } from '../../../extensions.js';
import { getRequestHeaders, eventSource, event_types } from '../../../../script.js';

const MODULE_NAME = 'lorebook-sync';
const EXT_VERSION = '0.8.1';

console.info('Lorebook Sync v' + EXT_VERSION + ' loaded');
const NOTION_API = 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';

// Database the author uses for testing. Users can change it in settings.
const DEFAULT_DATABASE_ID = '4154bb5f-cb35-807f-ad57-ed82105923bc';

const DB_KEYS = {
    lorebooks: 'lorebooksDb',
    characters: 'charactersDb',
    personas: 'personasDb',
    chats: 'chatsDb',
};

const CAT_LABELS = {
    lorebooks: 'Р›РѕСЂР±СѓРєРё',
    characters: 'РџРµСЂСЃРѕРЅР°Р¶Рё',
    personas: 'РџРµСЂСЃРѕРЅС‹',
    chats: 'Р§Р°С‚С‹',
};

const LANGS = ['ru', 'en', 'uk', 'sv'];

const I18N = {
    ru: {
        desc: 'РЎРёРЅС…СЂРѕРЅРёР·Р°С†РёСЏ РґР°РЅРЅС‹С… SillyTavern РІ Р±Р°Р·С‹ Notion.',
        show: 'Show',
        hide: 'Hide',
        test: 'РџСЂРѕРІРµСЂРёС‚СЊ СЃРІСЏР·СЊ',
        syncAll: 'РЎРёРЅС…СЂРѕРЅРёР·РёСЂРѕРІР°С‚СЊ РІСЃС‘',
        create: 'РЎРѕР·РґР°С‚СЊ РЅРµРґРѕСЃС‚Р°СЋС‰РёРµ Р±Р°Р·С‹',
        findDbs: 'рџ”Ќ РќР°Р№С‚Рё Р±Р°Р·С‹ РїРѕ РЅР°Р·РІР°РЅРёСЋ',
        parentLabel: 'ID СЃС‚СЂР°РЅРёС†С‹ Notion РґР»СЏ РЅРѕРІС‹С… Р±Р°Р· (РЅРµРѕР±СЏР·Р°С‚РµР»СЊРЅРѕ)',
        parentPlaceholder: 'page id',
        databases: 'Р‘Р°Р·С‹ Notion',
        lorebooks: 'рџ“љ Р›РѕСЂР±СѓРєРё',
        characters: 'рџЋ­ РџРµСЂСЃРѕРЅР°Р¶Рё',
        personas: 'рџ§‘ РџРµСЂСЃРѕРЅС‹',
        chats: 'рџ’¬ Р§Р°С‚С‹',
        includeEmpty: 'РІРєР»СЋС‡Р°С‚СЊ РїСѓСЃС‚С‹Рµ Р»РѕСЂР±СѓРєРё',
        chatLimit: 'С‡Р°С‚РѕРІ РЅР° РїРµСЂСЃРѕРЅР°Р¶Р°',
        msgLimit: 'СЃРѕРѕР±С‰РµРЅРёР№ РІ С‡Р°С‚Рµ',
        rewriteChats: 'РїРµСЂРµР·Р°РїРёСЃС‹РІР°С‚СЊ С‡Р°С‚С‹ С†РµР»РёРєРѕРј',
        autoTitle: 'рџ¤– РђРІС‚Рѕ-СЃРёРЅС…СЂРѕРЅРёР·Р°С†РёСЏ',
        autoEnable: 'Р°РІС‚Рѕ-СЃРёРЅС…СЂРѕРЅРёР·Р°С†РёСЏ Р°РєС‚РёРІРЅРѕРіРѕ С‡Р°С‚Р°',
        autoEvery: 'РєР°Р¶РґС‹Рµ N СЃРѕРѕР±С‰РµРЅРёР№',
        importTitle: 'в¬‡ РРјРїРѕСЂС‚ РёР· Notion',
        importOverwrite: 'РїРµСЂРµР·Р°РїРёСЃС‹РІР°С‚СЊ СЃСѓС‰РµСЃС‚РІСѓСЋС‰РµРµ',
        restoreLorebooks: 'Р’РѕСЃСЃС‚Р°РЅРѕРІРёС‚СЊ Р»РѕСЂР±СѓРєРё',
        restoreCharacters: 'Р’РѕСЃСЃС‚Р°РЅРѕРІРёС‚СЊ РїРµСЂСЃРѕРЅР°Р¶РµР№',
        uploadAvatars: 'Р·Р°РіСЂСѓР¶Р°С‚СЊ Р°РІР°С‚Р°СЂС‹ РІ РєР°СЂС‚РѕС‡РєРё Notion',
        exportTitle: 'рџ“¦ Р­РєСЃРїРѕСЂС‚ РІ Markdown (Obsidian)',
        exportChats: 'РІРєР»СЋС‡Р°С‚СЊ С‡Р°С‚С‹ (РјРѕР¶РµС‚ Р±С‹С‚СЊ РґРѕР»РіРѕ)',
        exportButton: 'РЎРєР°С‡Р°С‚СЊ .md Р°СЂС…РёРІ',
        dbPlaceholder: 'database id',
    },
    en: {
        desc: 'Sync SillyTavern data to Notion databases.',
        show: 'Show',
        hide: 'Hide',
        test: 'Test connection',
        syncAll: 'Sync all',
        create: 'Create missing databases',
        findDbs: 'Find databases by title',
        parentLabel: 'Notion page ID for new databases (optional)',
        parentPlaceholder: 'page id',
        databases: 'Notion databases',
        lorebooks: 'рџ“љ Lorebooks',
        characters: 'рџЋ­ Characters',
        personas: 'рџ§‘ Personas',
        chats: 'рџ’¬ Chats',
        includeEmpty: 'include empty lorebooks',
        chatLimit: 'chats per character',
        msgLimit: 'messages per chat',
        rewriteChats: 'rewrite chats fully',
        autoTitle: 'рџ¤– Auto-sync',
        autoEnable: 'auto-sync the active chat',
        autoEvery: 'every N messages',
        importTitle: 'в¬‡ Import from Notion',
        importOverwrite: 'overwrite existing',
        restoreLorebooks: 'Restore lorebooks',
        restoreCharacters: 'Restore characters',
        uploadAvatars: 'upload avatars into Notion cards',
        exportTitle: 'рџ“¦ Export to Markdown (Obsidian)',
        exportChats: 'include chats (can be slow)',
        exportButton: 'Download .md archive',
        dbPlaceholder: 'database id',
    },
    uk: {
        desc: 'РЎРёРЅС…СЂРѕРЅС–Р·Р°С†С–СЏ РґР°РЅРёС… SillyTavern Сѓ Р±Р°Р·Рё Notion.',
        show: 'Show',
        hide: 'Hide',
        test: 'РџРµСЂРµРІС–СЂРёС‚Рё Р·РІКјСЏР·РѕРє',
        syncAll: 'РЎРёРЅС…СЂРѕРЅС–Р·СѓРІР°С‚Рё РІСЃРµ',
        create: 'РЎС‚РІРѕСЂРёС‚Рё РІС–РґСЃСѓС‚РЅС– Р±Р°Р·Рё',
        findDbs: 'рџ”Ќ Р—РЅР°Р№С‚Рё Р±Р°Р·Рё Р·Р° РЅР°Р·РІРѕСЋ',
        parentLabel: 'ID СЃС‚РѕСЂС–РЅРєРё Notion РґР»СЏ РЅРѕРІРёС… Р±Р°Р· (РЅРµРѕР±РѕРІКјСЏР·РєРѕРІРѕ)',
        parentPlaceholder: 'page id',
        databases: 'Р‘Р°Р·Рё Notion',
        lorebooks: 'рџ“љ Р›РѕСЂР±СѓРєРё',
        characters: 'рџЋ­ РџРµСЂСЃРѕРЅР°Р¶С–',
        personas: 'рџ§‘ РџРµСЂСЃРѕРЅРё',
        chats: 'рџ’¬ Р§Р°С‚Рё',
        includeEmpty: 'РІРєР»СЋС‡Р°С‚Рё РїРѕСЂРѕР¶РЅС– Р»РѕСЂР±СѓРєРё',
        chatLimit: 'С‡Р°С‚С–РІ РЅР° РїРµСЂСЃРѕРЅР°Р¶Р°',
        msgLimit: 'РїРѕРІС–РґРѕРјР»РµРЅСЊ Сѓ С‡Р°С‚С–',
        rewriteChats: 'РїРµСЂРµР·Р°РїРёСЃСѓРІР°С‚Рё С‡Р°С‚Рё РїРѕРІРЅС–СЃС‚СЋ',
        autoTitle: 'рџ¤– РђРІС‚РѕСЃРёРЅС…СЂРѕРЅС–Р·Р°С†С–СЏ',
        autoEnable: 'Р°РІС‚РѕСЃРёРЅС…СЂРѕРЅС–Р·Р°С†С–СЏ Р°РєС‚РёРІРЅРѕРіРѕ С‡Р°С‚Сѓ',
        autoEvery: 'РєРѕР¶РЅС– N РїРѕРІС–РґРѕРјР»РµРЅСЊ',
        importTitle: 'в¬‡ Р†РјРїРѕСЂС‚ Р· Notion',
        importOverwrite: 'РїРµСЂРµР·Р°РїРёСЃСѓРІР°С‚Рё РЅР°СЏРІРЅРµ',
        restoreLorebooks: 'Р’С–РґРЅРѕРІРёС‚Рё Р»РѕСЂР±СѓРєРё',
        restoreCharacters: 'Р’С–РґРЅРѕРІРёС‚Рё РїРµСЂСЃРѕРЅР°Р¶С–РІ',
        uploadAvatars: 'Р·Р°РІР°РЅС‚Р°Р¶СѓРІР°С‚Рё Р°РІР°С‚Р°СЂРё РІ РєР°СЂС‚РєРё Notion',
        exportTitle: 'рџ“¦ Р•РєСЃРїРѕСЂС‚ Сѓ Markdown (Obsidian)',
        exportChats: 'РІРєР»СЋС‡Р°С‚Рё С‡Р°С‚Рё (РјРѕР¶Рµ Р±СѓС‚Рё РґРѕРІРіРѕ)',
        exportButton: 'Р—Р°РІР°РЅС‚Р°Р¶РёС‚Рё .md Р°СЂС…С–РІ',
        dbPlaceholder: 'database id',
    },
    sv: {
        desc: 'Synkronisera SillyTavern-data till Notion-databaser.',
        show: 'Show',
        hide: 'Hide',
        test: 'Testa anslutning',
        syncAll: 'Synka allt',
        create: 'Skapa saknade databaser',
        findDbs: 'SГ¶k databaser efter namn',
        parentLabel: 'Notion-sid-ID fГ¶r nya databaser (valfritt)',
        parentPlaceholder: 'page id',
        databases: 'Notion-databaser',
        lorebooks: 'рџ“љ Lorebooks',
        characters: 'рџЋ­ KaraktГ¤rer',
        personas: 'рџ§‘ Personer',
        chats: 'рџ’¬ Chattar',
        includeEmpty: 'inkludera tomma lorebooks',
        chatLimit: 'chattar per karaktГ¤r',
        msgLimit: 'meddelanden per chatt',
        rewriteChats: 'skriv Г¶ver chattar helt',
        autoTitle: 'рџ¤– Autosynk',
        autoEnable: 'autosynka den aktiva chatten',
        autoEvery: 'var N:e meddelande',
        importTitle: 'в¬‡ Importera frГҐn Notion',
        importOverwrite: 'skriv Г¶ver befintliga',
        restoreLorebooks: 'Г…terstГ¤ll lorebooks',
        restoreCharacters: 'Г…terstГ¤ll karaktГ¤rer',
        uploadAvatars: 'ladda upp avatarer till Notion-kort',
        exportTitle: 'рџ“¦ Exportera till Markdown (Obsidian)',
        exportChats: 'inkludera chattar (kan ta tid)',
        exportButton: 'Ladda ner .md-arkiv',
        dbPlaceholder: 'database id',
    },
};

function t(key) {
    const lang = getSettings().lang || 'ru';
    const dict = I18N[lang] || I18N.ru;
    if (dict && dict[key] != null) {
        return dict[key];
    }
    return I18N.ru[key] != null ? I18N.ru[key] : key;
}

function applyLanguage() {
    jQuery('.lorebook-sync-settings [data-ls-i18n]').each(function () {
        const key = jQuery(this).attr('data-ls-i18n');
        if (key) {
            jQuery(this).text(t(key));
        }
    });

    jQuery('.lorebook-sync-settings [data-ls-i18n-placeholder]').each(function () {
        const key = jQuery(this).attr('data-ls-i18n-placeholder');
        if (key) {
            jQuery(this).attr('placeholder', t(key));
        }
    });

    const lang = getSettings().lang || 'ru';
    jQuery('.lorebook-sync-settings .ls-lang')
        .removeClass('active')
        .filter('[data-ls-lang="' + lang + '"]')
        .addClass('active');

    const tokenField = jQuery('#ls_token');
    const toggle = jQuery('#ls_toggle_token');
    if (tokenField.length && toggle.length) {
        toggle.text(tokenField.attr('type') === 'text' ? t('hide') : t('show'));
    }
}

const defaultSettings = Object.freeze({
    enabled: true,
    lang: 'ru',
    token: '',
    lorebooksDb: DEFAULT_DATABASE_ID,
    charactersDb: '',
    personasDb: '',
    chatsDb: '',
    parentPageId: '',
    includeEmpty: false,
    chatLimit: 5,
    msgLimit: 300,
    rewriteChats: false,
    autoSyncEnabled: false,
    autoSyncEvery: 10,
    importOverwrite: false,
    uploadAvatars: true,
    exportChats: false,
    lastSync: '',
});

function getSettings() {
    if (!extension_settings[MODULE_NAME]) {
        extension_settings[MODULE_NAME] = structuredClone(defaultSettings);
    }
    const settings = extension_settings[MODULE_NAME];
    for (const key of Object.keys(defaultSettings)) {
        if (!Object.hasOwn(settings, key)) {
            settings[key] = defaultSettings[key];
        }
    }
    // Migrate the single-database config from v0.1.
    if (settings.databaseId) {
        if (!settings.lorebooksDb) {
            settings.lorebooksDb = settings.databaseId;
        }
        delete settings.databaseId;
    }
    return settings;
}

function persist() {
    const context = getContext();
    try {
        if (typeof context.saveSettingsDebounced === 'function') {
            context.saveSettingsDebounced();
        } else if (typeof context.saveSettings === 'function') {
            context.saveSettings();
        }
    } catch (err) {
        console.warn('Lorebook Sync: settings save failed', err);
    }
}

function shortId(id) {
    const value = String(id || '');
    return value.length > 10 ? (value.slice(0, 8) + 'вЂ¦') : value;
}

function setDbField(category, value) {
    jQuery('.lorebook-sync-settings [data-dbcat="' + category + '"], #ls_db_' + category).val(value);
}

/* ------------------------------------------------------------------ */
/* UI helpers                                                          */
/* ------------------------------------------------------------------ */

function timestamp() {
    return new Date().toLocaleTimeString();
}

function setStatus(text, kind) {
    const area = jQuery('#ls_log');
    if (!area.length) {
        console.log('Lorebook Sync:', text);
        return;
    }
    const line = jQuery('<div>')
        .addClass('ls-line ls-' + (kind || 'info'))
        .text('[' + timestamp() + '] ' + text);
    area.append(line);
    while (area[0].childElementCount > 300) {
        area[0].firstElementChild.remove();
    }
    area.scrollTop(area[0].scrollHeight);
}

function setProgress(text) {
    jQuery('#ls_progress').text(text || '');
}

function setBusy(busy) {
    jQuery('.ls-sync-btn, #ls_test, #ls_sync_all, #ls_create_dbs, #ls_find_dbs, #ls_restore_lorebooks, #ls_restore_characters, #ls_export_md')
        .toggleClass('disabled', busy)
        .attr('aria-disabled', busy ? 'true' : 'false');
    jQuery('#ls_spinner').toggleClass('visible', busy);
}

/* ------------------------------------------------------------------ */
/* Notion API                                                          */
/* ------------------------------------------------------------------ */

async function notionRequest(path, options) {
    const opts = options || {};
    const settings = getSettings();
    const headers = Object.assign(
        {
            'Authorization': 'Bearer ' + settings.token,
            'Notion-Version': NOTION_VERSION,
        },
        opts.headers || {},
    );
    if (opts.body) {
        headers['Content-Type'] = 'application/json';
    }

    // Notion allows roughly 3 requests per second; retry politely on 429.
    for (let attempt = 0; ; attempt++) {
        const response = await fetch(NOTION_API + path, {
            method: opts.method || 'GET',
            headers,
            body: opts.body ? JSON.stringify(opts.body) : undefined,
        });

        if (response.status === 429 && attempt < 4) {
            const retryAfter = Number(response.headers.get('retry-after') || '1');
            const wait = Math.min(30000, Math.max(700, retryAfter * 1000));
            await new Promise(function (resolve) {
                setTimeout(resolve, wait);
            });
            continue;
        }

        const text = await response.text();
        let data = {};
        if (text) {
            try {
                data = JSON.parse(text);
            } catch (err) {
                data = { message: text };
            }
        }

        if (!response.ok) {
            const message = (data && data.message) ? data.message : ('Notion HTTP ' + response.status);
            throw new Error(message);
        }

        return data;
    }
}

const titlePropertyCache = {};

async function getTitleProperty(databaseId) {
    if (titlePropertyCache[databaseId]) {
        return titlePropertyCache[databaseId];
    }
    const db = await notionRequest('/databases/' + databaseId);
    const properties = db.properties || {};
    const found = Object.keys(properties).find(function (name) {
        return properties[name].type === 'title';
    });
    const result = found || 'Name';
    titlePropertyCache[databaseId] = result;
    return result;
}

function avatarUrlForCharacter(character) {
    if (!character || !character.avatar) {
        return null;
    }
    return '/characters/' + encodeURIComponent(character.avatar);
}

function avatarUrlForPersona(avatar) {
    if (!avatar) {
        return null;
    }
    return '/User%20Avatars/' + encodeURIComponent(avatar);
}

async function uploadAvatarImage(url) {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error('avatar HTTP ' + response.status);
    }

    const blob = await response.blob();
    const filename = decodeURIComponent(url.split('/').pop() || 'avatar.png');

    const created = await notionRequest('/file_uploads', {
        method: 'POST',
        body: {
            filename,
            content_type: blob.type || 'image/png',
        },
    });

    const form = new FormData();
    form.append('file', blob, filename);

    const send = await fetch(created.upload_url, {
        method: 'POST',
        headers: {
            'Authorization': 'Bearer ' + getSettings().token,
            'Notion-Version': NOTION_VERSION,
        },
        body: form,
    });
    if (!send.ok) {
        throw new Error('avatar upload HTTP ' + send.status);
    }

    return created.id;
}

async function setPageAvatar(pageId, uploadId) {
    await notionRequest('/pages/' + pageId, {
        method: 'PATCH',
        body: {
            icon: { type: 'file_upload', file_upload: { id: uploadId } },
            cover: { type: 'file_upload', file_upload: { id: uploadId } },
        },
    });
}

async function applyAvatar(pageId, url, label) {
    if (!url) {
        return false;
    }
    try {
        const uploadId = await uploadAvatarImage(url);
        await setPageAvatar(pageId, uploadId);
        setStatus('рџ–ј ' + label + ': Р°РІР°С‚Р°СЂ Р·Р°РіСЂСѓР¶РµРЅ', 'ok');
        return true;
    } catch (err) {
        setStatus('рџ–ј ' + label + ': Р°РІР°С‚Р°СЂ РїСЂРѕРїСѓС‰РµРЅ вЂ” ' + err.message, 'muted');
        return false;
    }
}

function hashString(input) {
    const value = String(input == null ? '' : input);
    let hash = 2166136261;
    for (let i = 0; i < value.length; i++) {
        hash ^= value.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16);
}

const SYNC_PROPERTY = 'Sync';
const syncPropertyCache = {};

/**
 * Adds a "Sync" rich_text property to the database once, so pages can
 * remember what was already written without scanning all blocks.
 */
async function ensureSyncProperty(databaseId) {
    if (!databaseId || syncPropertyCache[databaseId]) {
        return;
    }
    const db = await notionRequest('/databases/' + databaseId);
    const properties = db.properties || {};
    if (!properties[SYNC_PROPERTY] || properties[SYNC_PROPERTY].type !== 'rich_text') {
        const body = { properties: {} };
        body.properties[SYNC_PROPERTY] = { rich_text: {} };
        await notionRequest('/databases/' + databaseId, { method: 'PATCH', body });
    }
    syncPropertyCache[databaseId] = true;
}

function encodeMarker(data) {
    return 'вџ¦ls:v1 ' + Object.keys(data).map(function (key) {
        return key + '=' + data[key];
    }).join(' ') + 'вџ§';
}

function parseMarker(text) {
    const match = /^вџ¦ls:v1\s+(.+?)вџ§$/.exec(String(text || '').trim());
    if (!match) {
        return null;
    }
    const result = {};
    for (const pair of match[1].split(/\s+/)) {
        const eq = pair.indexOf('=');
        if (eq > 0) {
            result[pair.slice(0, eq)] = pair.slice(eq + 1);
        }
    }
    return result;
}

function readMarker(page) {
    const property = page && page.properties && page.properties[SYNC_PROPERTY];
    if (!property || !Array.isArray(property.rich_text)) {
        return null;
    }
    const text = property.rich_text.map(function (part) {
        return part.plain_text || (part.text && part.text.content) || '';
    }).join('');
    return parseMarker(text);
}

async function writeMarker(pageId, data) {
    await notionRequest('/pages/' + pageId, {
        method: 'PATCH',
        body: {
            properties: {
                [SYNC_PROPERTY]: {
                    rich_text: [{ type: 'text', text: { content: encodeMarker(data) } }],
                },
            },
        },
    });
}

async function createPage(databaseId, title) {
    const property = await getTitleProperty(databaseId);
    const properties = {};
    properties[property] = {
        title: [{ type: 'text', text: { content: title.slice(0, 1900) } }],
    };
    const created = await notionRequest('/pages', {
        method: 'POST',
        body: {
            parent: { database_id: databaseId },
            properties,
        },
    });
    return created.id;
}

function summaryLine(result) {
    const parts = [result.ok + ' РѕР±РЅРѕРІР»РµРЅРѕ'];
    if (result.skipped) {
        parts.push(result.skipped + ' Р±РµР· РёР·РјРµРЅРµРЅРёР№');
    }
    parts.push(result.failed + ' РѕС€РёР±РѕРє');
    return parts.join(', ');
}

const SNAPSHOT_PREFIX = 'вџ¦ls-snapshot:v1 ';

const CHARACTER_FIELDS = [
    'description',
    'personality',
    'scenario',
    'first_mes',
    'mes_example',
    'creator_notes',
    'system_prompt',
    'post_history_instructions',
];

function snapshotBlock(kind, payload) {
    const data = { kind };
    for (const key of Object.keys(payload || {})) {
        data[key] = payload[key];
    }
    const text = SNAPSHOT_PREFIX + JSON.stringify(data) + 'вџ§';
    return {
        object: 'block',
        type: 'code',
        code: {
            language: 'json',
            rich_text: richText(text),
        },
    };
}

async function listChildBlocks(pageId) {
    const blocks = [];
    let cursor = undefined;
    for (;;) {
        const query = cursor
            ? ('?page_size=100&start_cursor=' + encodeURIComponent(cursor))
            : '?page_size=100';
        const data = await notionRequest('/blocks/' + pageId + '/children' + query);
        for (const block of (data.results || [])) {
            const payload = block[block.type] || {};
            const text = (payload.rich_text || []).map(function (part) {
                return part.plain_text || (part.text && part.text.content) || '';
            }).join('');
            blocks.push({ id: block.id, type: block.type, text });
        }
        if (!data.has_more) {
            break;
        }
        cursor = data.next_cursor;
    }
    return blocks;
}

async function readSnapshot(pageId) {
    const blocks = await listChildBlocks(pageId);
    for (const block of blocks) {
        if (block.type !== 'code' || !block.text.startsWith(SNAPSHOT_PREFIX)) {
            continue;
        }
        const end = block.text.lastIndexOf('вџ§');
        if (end < SNAPSHOT_PREFIX.length) {
            continue;
        }
        try {
            return JSON.parse(block.text.slice(SNAPSHOT_PREFIX.length, end));
        } catch (err) {
            return null;
        }
    }
    return null;
}

async function listDatabasePages(databaseId) {
    const pages = [];
    let cursor = undefined;
    for (;;) {
        const body = { page_size: 100 };
        if (cursor) {
            body.start_cursor = cursor;
        }
        const data = await notionRequest('/databases/' + databaseId + '/query', {
            method: 'POST',
            body,
        });
        for (const page of (data.results || [])) {
            pages.push(page);
        }
        if (!data.has_more) {
            break;
        }
        cursor = data.next_cursor;
    }
    return pages;
}

function pageTitle(page) {
    const properties = (page && page.properties) || {};
    for (const key of Object.keys(properties)) {
        const property = properties[key];
        if (property && property.type === 'title' && Array.isArray(property.title)) {
            return property.title.map(function (part) {
                return part.plain_text || (part.text && part.text.content) || '';
            }).join('');
        }
    }
    return 'Untitled';
}

function richText(content) {
    const value = String(content == null ? '' : content);
    const parts = [];
    let rest = value;
    while (rest.length > 0) {
        parts.push({ type: 'text', text: { content: rest.slice(0, 1900) } });
        rest = rest.slice(1900);
    }
    if (parts.length === 0) {
        parts.push({ type: 'text', text: { content: '' } });
    }
    return parts;
}

function headingBlock(text) {
    return {
        object: 'block',
        type: 'heading_3',
        heading_3: { rich_text: richText(String(text).slice(0, 1900)) },
    };
}

function paragraphBlock(text, italic) {
    return {
        object: 'block',
        type: 'paragraph',
        paragraph: {
            rich_text: [{
                type: 'text',
                text: { content: String(text).slice(0, 1900) },
                annotations: italic ? { italic: true, color: 'gray' } : undefined,
            }],
        },
    };
}

async function appendBlocks(pageId, blocks) {
    for (let index = 0; index < blocks.length; index += 100) {
        await notionRequest('/blocks/' + pageId + '/children', {
            method: 'PATCH',
            body: { children: blocks.slice(index, index + 100) },
        });
    }
}

async function listChildren(pageId) {
    const ids = [];
    let cursor = undefined;
    for (;;) {
        const query = cursor
            ? ('?page_size=100&start_cursor=' + encodeURIComponent(cursor))
            : '?page_size=100';
        const data = await notionRequest('/blocks/' + pageId + '/children' + query);
        for (const block of (data.results || [])) {
            ids.push(block.id);
        }
        if (!data.has_more) {
            break;
        }
        cursor = data.next_cursor;
    }
    return ids;
}

async function clearPage(pageId) {
    const ids = await listChildren(pageId);
    for (const id of ids) {
        try {
            await notionRequest('/blocks/' + id, { method: 'DELETE' });
        } catch (err) {
            // A block may already be gone; keep going.
        }
    }
}

async function findPageByTitle(databaseId, title) {
    const property = await getTitleProperty(databaseId);
    const data = await notionRequest('/databases/' + databaseId + '/query', {
        method: 'POST',
        body: {
            filter: { property: property, title: { equals: title } },
            page_size: 1,
        },
    });
    return (data.results && data.results[0]) || null;
}

/**
 * Create the page if missing, otherwise rewrite its content.
 */
async function upsertPage(databaseId, title, blocks) {
    const property = await getTitleProperty(databaseId);
    let pageId;

    const existing = await findPageByTitle(databaseId, title);
    if (existing) {
        pageId = existing.id;
        await clearPage(pageId);
    } else {
        const properties = {};
        properties[property] = {
            title: [{ type: 'text', text: { content: title.slice(0, 1900) } }],
        };
        const created = await notionRequest('/pages', {
            method: 'POST',
            body: {
                parent: { database_id: databaseId },
                properties,
            },
        });
        pageId = created.id;
    }

    await appendBlocks(pageId, blocks);
    return pageId;
}

/* ------------------------------------------------------------------ */
/* SillyTavern sources                                                 */
/* ------------------------------------------------------------------ */

async function listLorebooks() {
    const response = await fetch('/api/worldinfo/list', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({}),
    });
    if (!response.ok) {
        throw new Error('SillyTavern /api/worldinfo/list: HTTP ' + response.status);
    }
    const data = await response.json();
    return Array.isArray(data) ? data : [];
}

async function readLorebook(name) {
    const response = await fetch('/api/worldinfo/get', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({ name }),
    });
    if (!response.ok) {
        throw new Error('SillyTavern /api/worldinfo/get: HTTP ' + response.status);
    }
    return await response.json();
}

async function listCharacterChats(character) {
    const response = await fetch('/api/characters/chats', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({ avatar_url: character.avatar, simple: true }),
    });
    if (!response.ok) {
        return [];
    }
    const data = await response.json();
    return Array.isArray(data) ? data : [];
}

async function readChat(character, file) {
    const response = await fetch('/api/chats/get', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({
            ch_name: character.name,
            file_name: file.file_id,
            avatar_url: character.avatar,
        }),
    });
    if (!response.ok) {
        return [];
    }
    const data = await response.json();
    return Array.isArray(data) ? data : [];
}

/* ------------------------------------------------------------------ */
/* Block builders                                                      */
/* ------------------------------------------------------------------ */

function entryBlocks(entries) {
    const blocks = [];
    for (const uid of Object.keys(entries)) {
        const entry = entries[uid] || {};
        const primaryKeys = [entry.key, entry.keysecondary].filter(Boolean).join(', ');
        const label = (entry.comment && String(entry.comment).trim()) || primaryKeys || ('Entry ' + uid);
        const heading = primaryKeys && entry.comment ? (label + ' вЂ” ' + primaryKeys) : label;

        blocks.push(headingBlock(heading));

        const content = (entry.content || '').trim();
        if (content) {
            blocks.push(paragraphBlock(content, false));
        }

        const flags = [];
        if (entry.disable) flags.push('disabled');
        if (entry.constant) flags.push('constant');
        if (entry.vectorized) flags.push('vectorized');
        if (flags.length) {
            blocks.push(paragraphBlock('[' + flags.join(', ') + ']', true));
        }
    }
    return blocks;
}

function characterBlocks(character) {
    const blocks = [];
    const sections = [
        ['РћРїРёСЃР°РЅРёРµ', character.description],
        ['Р›РёС‡РЅРѕСЃС‚СЊ', character.personality],
        ['РЎС†РµРЅР°СЂРёР№', character.scenario],
        ['РџРµСЂРІРѕРµ СЃРѕРѕР±С‰РµРЅРёРµ', character.first_mes],
        ['РџСЂРёРјРµСЂС‹ РґРёР°Р»РѕРіР°', character.mes_example],
        ['Р—Р°РјРµС‚РєРё Р°РІС‚РѕСЂР°', character.creator_notes],
        ['РЎРёСЃС‚РµРјРЅС‹Р№ РїСЂРѕРјРїС‚', character.system_prompt],
        ['РџРѕСЃС‚-РёРЅСЃС‚СЂСѓРєС†РёРё', character.post_history_instructions],
    ];

    for (const pair of sections) {
        const value = (pair[1] || '').trim();
        if (!value) {
            continue;
        }
        blocks.push(headingBlock(pair[0]));
        blocks.push(paragraphBlock(value, false));
    }

    const greetings = Array.isArray(character.alternate_greetings)
        ? character.alternate_greetings.filter(Boolean)
        : [];
    if (greetings.length) {
        blocks.push(headingBlock('РђР»СЊС‚РµСЂРЅР°С‚РёРІРЅС‹Рµ РїСЂРёРІРµС‚СЃС‚РІРёСЏ (' + greetings.length + ')'));
        greetings.forEach(function (greeting, index) {
            blocks.push(paragraphBlock((index + 1) + '. ' + greeting, false));
        });
    }

    if (Array.isArray(character.tags) && character.tags.length) {
        blocks.push(paragraphBlock('РўРµРіРё: ' + character.tags.join(', '), true));
    }
    if (character.avatar) {
        blocks.push(paragraphBlock('РђРІР°С‚Р°СЂ: ' + character.avatar, true));
    }

    return blocks;
}

function personaBlocks(avatar, name, description) {
    const blocks = [];
    const info = description || {};
    if (info.title) {
        blocks.push(paragraphBlock('Р—Р°РіРѕР»РѕРІРѕРє: ' + info.title, true));
    }
    const text = (info.description || '').trim();
    if (text) {
        blocks.push(headingBlock('РћРїРёСЃР°РЅРёРµ'));
        blocks.push(paragraphBlock(text, false));
    }
    blocks.push(paragraphBlock('РђРІР°С‚Р°СЂ: ' + avatar, true));
    return blocks;
}

function chatBlocks(messages, limit) {
    const list = messages.filter(function (message) {
        return message && typeof message.mes === 'string' && message.mes.length > 0;
    });
    const tail = limit > 0 ? list.slice(-limit) : list;
    const blocks = [];

    if (limit > 0 && list.length > limit) {
        blocks.push(paragraphBlock('РџРѕРєР°Р·Р°РЅС‹ РїРѕСЃР»РµРґРЅРёРµ ' + limit + ' РёР· ' + list.length + ' СЃРѕРѕР±С‰РµРЅРёР№.', true));
    }

    for (const message of tail) {
        const who = message.name || (message.is_user ? 'User' : 'Character');
        blocks.push(paragraphBlock(who + ': ' + message.mes, false));
    }
    return blocks;
}

/* ------------------------------------------------------------------ */
/* Sync per category                                                   */
/* ------------------------------------------------------------------ */

async function syncLorebooks() {
    const settings = getSettings();
    await ensureSyncProperty(settings.lorebooksDb);

    const books = await listLorebooks();
    setStatus('Р›РѕСЂР±СѓРєРё: РЅР°Р№РґРµРЅРѕ ' + books.length, 'info');

    let ok = 0;
    let failed = 0;
    let skipped = 0;

    for (const book of books) {
        try {
            const data = await readLorebook(book.name);
            const entries = data.entries || {};
            const count = Object.keys(entries).length;

            if (count === 0 && !settings.includeEmpty) {
                setStatus('вЂ” ' + book.name + ': РїСѓСЃС‚РѕР№, РїСЂРѕРїСѓСЃРє', 'muted');
                skipped++;
                continue;
            }

            const blocks = entryBlocks(entries);
            const signature = hashString(JSON.stringify(entries));

            const existing = await findPageByTitle(settings.lorebooksDb, book.name);
            if (existing) {
                const marker = readMarker(existing);
                if (marker && marker.kind === 'lorebook' && marker.hash === signature && marker.snap === '1') {
                    setStatus('вЂ” ' + book.name + ': Р±РµР· РёР·РјРµРЅРµРЅРёР№', 'muted');
                    skipped++;
                    continue;
                }
            }

            const pageId = await upsertPage(settings.lorebooksDb, book.name, blocks);
            await appendBlocks(pageId, [snapshotBlock('lorebook', { name: book.name, entries })]);
            await writeMarker(pageId, { kind: 'lorebook', hash: signature, snap: 1 });
            setStatus('вЂ” ' + book.name + ': ' + count + ' Р·Р°РїРёСЃРµР№', 'ok');
            ok++;
        } catch (err) {
            failed++;
            setStatus('вЂ” ' + book.name + ': ' + err.message, 'error');
        }
    }

    return { ok, failed, skipped };
}

async function syncCharacters() {
    const settings = getSettings();
    await ensureSyncProperty(settings.charactersDb);

    const characters = getContext().characters || [];
    setStatus('РџРµСЂСЃРѕРЅР°Р¶Рё: РЅР°Р№РґРµРЅРѕ ' + characters.length, 'info');

    let ok = 0;
    let failed = 0;
    let skipped = 0;

    for (const character of characters) {
        try {
            const name = character.name || 'Unnamed';
            const blocks = characterBlocks(character);
            const signature = hashString(JSON.stringify(blocks));

            const existing = await findPageByTitle(settings.charactersDb, name);
            const marker = existing ? readMarker(existing) : null;
            const unchanged = Boolean(existing && marker && marker.kind === 'character'
                && marker.hash === signature && marker.snap === '1');
            const needsAvatar = Boolean(settings.uploadAvatars && (!marker || marker.av !== '1'));

            if (unchanged && !needsAvatar) {
                setStatus('вЂ” ' + name + ': Р±РµР· РёР·РјРµРЅРµРЅРёР№', 'muted');
                skipped++;
                continue;
            }

            if (unchanged && needsAvatar) {
                const done = await applyAvatar(existing.id, avatarUrlForCharacter(character), name);
                if (done) {
                    await writeMarker(existing.id, { kind: 'character', hash: signature, snap: 1, av: 1 });
                }
                setStatus('вЂ” ' + name + ': РєРѕРЅС‚РµРЅС‚ Р±РµР· РёР·РјРµРЅРµРЅРёР№', 'muted');
                skipped++;
                continue;
            }

            const pageId = await upsertPage(settings.charactersDb, name, blocks);
            const fields = {};
            for (const field of CHARACTER_FIELDS) {
                fields[field] = character[field] == null ? '' : character[field];
            }
            await appendBlocks(pageId, [snapshotBlock('character', { name, fields })]);

            let avatarDone = false;
            if (settings.uploadAvatars) {
                avatarDone = await applyAvatar(pageId, avatarUrlForCharacter(character), name);
            }

            await writeMarker(pageId, {
                kind: 'character',
                hash: signature,
                snap: 1,
                av: avatarDone ? 1 : 0,
            });
            setStatus('вЂ” ' + name + ': РѕР±РЅРѕРІР»С‘РЅ', 'ok');
            ok++;
        } catch (err) {
            failed++;
            setStatus('вЂ” ' + (character.name || '?') + ': ' + err.message, 'error');
        }
    }

    return { ok, failed, skipped };
}

async function syncPersonas() {
    const settings = getSettings();
    await ensureSyncProperty(settings.personasDb);

    const powerUser = getContext().powerUserSettings || {};
    const personas = powerUser.personas || {};
    const descriptions = powerUser.persona_descriptions || {};
    const avatars = Object.keys(personas);

    setStatus('РџРµСЂСЃРѕРЅС‹: РЅР°Р№РґРµРЅРѕ ' + avatars.length, 'info');

    let ok = 0;
    let failed = 0;
    let skipped = 0;

    for (const avatar of avatars) {
        const name = personas[avatar] || avatar;
        try {
            const blocks = personaBlocks(avatar, name, descriptions[avatar]);
            const signature = hashString(JSON.stringify(blocks));

            const existing = await findPageByTitle(settings.personasDb, name);
            const marker = existing ? readMarker(existing) : null;
            const unchanged = Boolean(existing && marker && marker.kind === 'persona'
                && marker.hash === signature);
            const needsAvatar = Boolean(settings.uploadAvatars && (!marker || marker.av !== '1'));

            if (unchanged && !needsAvatar) {
                setStatus('вЂ” ' + name + ': Р±РµР· РёР·РјРµРЅРµРЅРёР№', 'muted');
                skipped++;
                continue;
            }

            if (unchanged && needsAvatar) {
                const done = await applyAvatar(existing.id, avatarUrlForPersona(avatar), name);
                if (done) {
                    await writeMarker(existing.id, { kind: 'persona', hash: signature, av: 1 });
                }
                setStatus('вЂ” ' + name + ': РєРѕРЅС‚РµРЅС‚ Р±РµР· РёР·РјРµРЅРµРЅРёР№', 'muted');
                skipped++;
                continue;
            }

            const pageId = await upsertPage(settings.personasDb, name, blocks);

            let avatarDone = false;
            if (settings.uploadAvatars) {
                avatarDone = await applyAvatar(pageId, avatarUrlForPersona(avatar), name);
            }

            await writeMarker(pageId, { kind: 'persona', hash: signature, av: avatarDone ? 1 : 0 });
            setStatus('вЂ” ' + name + ': РѕР±РЅРѕРІР»С‘РЅ', 'ok');
            ok++;
        } catch (err) {
            failed++;
            setStatus('вЂ” ' + name + ': ' + err.message, 'error');
        }
    }

    return { ok, failed, skipped };
}

function chatBlocksFrom(list, from, to) {
    const blocks = [];
    for (let i = from; i < to; i++) {
        const message = list[i];
        const who = message.name || (message.is_user ? 'User' : 'Character');
        blocks.push(paragraphBlock(who + ': ' + message.mes, false));
    }
    return blocks;
}

async function syncChatFile(character, file, settings) {
    const title = (character.name || 'Unnamed') + ' вЂ” ' + file.file_id;
    const messages = await readChat(character, file);
    const list = messages.filter(function (message) {
        return message && typeof message.mes === 'string' && message.mes.trim().length > 0;
    });

    if (!list.length) {
        return { status: 'empty', appended: 0, total: 0, title };
    }

    const existing = await findPageByTitle(settings.chatsDb, title);
    let pageId = existing ? existing.id : null;
    let from = 0;

    if (pageId) {
        const marker = settings.rewriteChats ? null : readMarker(existing);
        if (marker && marker.kind === 'chat') {
            const cursor = Number(marker.cursor);
            if (Number.isFinite(cursor)) {
                if (cursor >= list.length - 1) {
                    return { status: 'skipped', appended: 0, total: list.length, title };
                }
                from = cursor + 1;
            }
        }

        if (settings.rewriteChats || from === 0) {
            await clearPage(pageId);
            from = settings.msgLimit > 0 ? Math.max(0, list.length - settings.msgLimit) : 0;
        } else if (settings.msgLimit > 0) {
            from = Math.max(from, list.length - settings.msgLimit);
        }
    } else {
        pageId = await createPage(settings.chatsDb, title);
        from = settings.msgLimit > 0 ? Math.max(0, list.length - settings.msgLimit) : 0;
    }

    const blocks = chatBlocksFrom(list, from, list.length);
    let appended = 0;
    if (blocks.length) {
        await appendBlocks(pageId, blocks);
        appended = list.length - from;
    }

    await writeMarker(pageId, { kind: 'chat', cursor: list.length - 1 });
    return { status: 'updated', appended, total: list.length, title };
}

async function syncChats() {
    const settings = getSettings();
    await ensureSyncProperty(settings.chatsDb);

    const characters = getContext().characters || [];
    setStatus('Р§Р°С‚С‹: РїРµСЂСЃРѕРЅР°Р¶РµР№ ' + characters.length, 'info');

    let ok = 0;
    let failed = 0;
    let skipped = 0;

    for (const character of characters) {
        let chats = [];
        try {
            chats = await listCharacterChats(character);
        } catch (err) {
            setStatus('вЂ” ' + character.name + ': СЃРїРёСЃРѕРє С‡Р°С‚РѕРІ РЅРµРґРѕСЃС‚СѓРїРµРЅ', 'error');
            failed++;
            continue;
        }

        if (!chats.length) {
            continue;
        }

        chats.sort(function (a, b) {
            return String(b.file_id).localeCompare(String(a.file_id));
        });
        const selected = chats.slice(0, Math.max(1, settings.chatLimit));

        for (const file of selected) {
            try {
                const result = await syncChatFile(character, file, settings);
                if (result.status === 'skipped') {
                    setStatus('вЂ” ' + result.title + ': Р±РµР· РёР·РјРµРЅРµРЅРёР№ (' + result.total + ')', 'muted');
                    skipped++;
                } else if (result.status === 'updated') {
                    setStatus('вЂ” ' + result.title + ': +' + result.appended + ' СЃРѕРѕР±С‰РµРЅРёР№ (РІСЃРµРіРѕ ' + result.total + ')', 'ok');
                    ok++;
                }
            } catch (err) {
                failed++;
                setStatus('вЂ” ' + (character.name || '?') + ': ' + err.message, 'error');
            }
        }
    }

    return { ok, failed, skipped };
}

async function autoSyncTick() {
    const settings = getSettings();
    if (!settings.autoSyncEnabled || !settings.token || !settings.chatsDb) {
        return;
    }
    if (autoSyncRunning) {
        return;
    }

    const every = Math.max(1, Number(settings.autoSyncEvery) || 10);
    autoSyncCounter++;
    updateAutoState();
    if (autoSyncCounter < every) {
        return;
    }
    autoSyncCounter = 0;
    updateAutoState();

    const context = getContext();
    const character = context.characters && context.characters[context.characterId];
    const chatFileId = context.chatId;

    if (!character || !character.avatar || !chatFileId) {
        setStatus('рџ¤– РђРІС‚Рѕ-СЃРёРЅРє: Р°РєС‚РёРІРЅС‹Р№ РѕРґРёРЅРѕС‡РЅС‹Р№ С‡Р°С‚ РЅРµ РЅР°Р№РґРµРЅ вЂ” РїСЂРѕРїСѓСЃРє', 'muted');
        return;
    }

    autoSyncRunning = true;
    setBusy(true);
    setStatus('рџ¤– РђРІС‚Рѕ-СЃРёРЅРє: ' + every + ' СЃРѕРѕР±С‰РµРЅРёР№ в†’ ' + (character.name || 'РїРµСЂСЃРѕРЅР°Р¶'), 'info');

    try {
        const result = await syncChatFile(character, { file_id: chatFileId }, settings);
        if (result.status === 'updated') {
            setStatus('рџ¤– РђРІС‚Рѕ-СЃРёРЅРє: +' + result.appended + ' СЃРѕРѕР±С‰РµРЅРёР№ (РІСЃРµРіРѕ ' + result.total + ')', 'ok');
        } else if (result.status === 'skipped') {
            setStatus('рџ¤– РђРІС‚Рѕ-СЃРёРЅРє: Р±РµР· РёР·РјРµРЅРµРЅРёР№', 'muted');
        }
    } catch (err) {
        setStatus('рџ¤– РђРІС‚Рѕ-СЃРёРЅРє: ' + err.message, 'error');
    } finally {
        autoSyncRunning = false;
        setBusy(false);
    }
}

const SYNC_FUNCTIONS = {
    lorebooks: syncLorebooks,
    characters: syncCharacters,
    personas: syncPersonas,
    chats: syncChats,
};

async function runCategory(category) {
    const settings = getSettings();
    if (!settings.token) {
        setStatus('РЎРЅР°С‡Р°Р»Р° СѓРєР°Р¶РёС‚Рµ Notion integration token.', 'error');
        return;
    }
    if (!settings[DB_KEYS[category]]) {
        setStatus(CAT_LABELS[category] + ': СѓРєР°Р¶РёС‚Рµ database ID.', 'error');
        return;
    }

    setBusy(true);
    setProgress('РЎРёРЅС…СЂРѕРЅРёР·Р°С†РёСЏ: ' + CAT_LABELS[category] + '...');
    setStatus('в–¶ ' + CAT_LABELS[category] + ': СЃС‚Р°СЂС‚ (Р±Р°Р·Р° ' + shortId(settings[DB_KEYS[category]]) + ')', 'info');

    try {
        const result = await SYNC_FUNCTIONS[category]();
        settings.lastSync = new Date().toISOString();
        persist();
        setStatus(
            CAT_LABELS[category] + ': РіРѕС‚РѕРІРѕ вЂ” ' + summaryLine(result),
            result.failed > 0 ? 'error' : 'ok',
        );
    } catch (err) {
        setStatus(CAT_LABELS[category] + ': РѕС€РёР±РєР° вЂ” ' + err.message, 'error');
    } finally {
        setProgress('');
        setBusy(false);
    }
}

async function syncAll() {
    const settings = getSettings();
    if (!settings.token) {
        setStatus('РЎРЅР°С‡Р°Р»Р° СѓРєР°Р¶РёС‚Рµ Notion integration token.', 'error');
        return;
    }

    const categories = Object.keys(DB_KEYS).filter(function (category) {
        return Boolean(settings[DB_KEYS[category]]);
    });

    if (!categories.length) {
        setStatus('РќРµ СѓРєР°Р·Р°РЅР° РЅРё РѕРґРЅР° Р±Р°Р·Р° Notion.', 'error');
        return;
    }

    setBusy(true);
    setStatus('в–¶ РЎРёРЅС…СЂРѕРЅРёР·Р°С†РёСЏ РІСЃРµС… РєР°С‚РµРіРѕСЂРёР№: СЃС‚Р°СЂС‚ (' + categories.length + ')', 'info');
    setStatus('вЏі Р­С‚Рѕ РјРѕР¶РµС‚ Р·Р°РЅСЏС‚СЊ РЅРµСЃРєРѕР»СЊРєРѕ РјРёРЅСѓС‚ вЂ” РЅРµ Р·Р°РєСЂС‹РІР°Р№С‚Рµ РІРєР»Р°РґРєСѓ.', 'muted');

    let totalOk = 0;
    let totalFailed = 0;

    try {
        for (const category of categories) {
            setProgress('РЎРёРЅС…СЂРѕРЅРёР·Р°С†РёСЏ: ' + CAT_LABELS[category] + '...');
            setStatus('в–¶ ' + CAT_LABELS[category] + ': СЃС‚Р°СЂС‚ (Р±Р°Р·Р° ' + shortId(settings[DB_KEYS[category]]) + ')', 'info');
            try {
                const result = await SYNC_FUNCTIONS[category]();
                totalOk += result.ok;
                totalFailed += result.failed;
                setStatus(
                    CAT_LABELS[category] + ': РіРѕС‚РѕРІРѕ вЂ” ' + summaryLine(result),
                    result.failed > 0 ? 'error' : 'ok',
                );
            } catch (err) {
                totalFailed++;
                setStatus(CAT_LABELS[category] + ': РѕС€РёР±РєР° вЂ” ' + err.message, 'error');
            }
        }

        settings.lastSync = new Date().toISOString();
        persist();
        setStatus(
            'Р’СЃС‘ РіРѕС‚РѕРІРѕ вЂ” ' + totalOk + ' СЃС‚СЂР°РЅРёС†, ' + totalFailed + ' РѕС€РёР±РѕРє.',
            totalFailed > 0 ? 'error' : 'ok',
        );
    } catch (err) {
        setStatus('РЎРёРЅС…СЂРѕРЅРёР·Р°С†РёСЏ РїСЂРµСЂРІР°РЅР°: ' + err.message, 'error');
    } finally {
        setProgress('');
        setBusy(false);
        setStatus('вЏ№ РЎРёРЅС…СЂРѕРЅРёР·Р°С†РёСЏ Р·Р°РІРµСЂС€РµРЅР°, РєРЅРѕРїРєРё СЃРЅРѕРІР° Р°РєС‚РёРІРЅС‹.', 'muted');
    }
}

async function testConnection() {
    const settings = getSettings();
    if (!settings.token) {
        setStatus('Р’РІРµРґРёС‚Рµ Notion integration token.', 'error');
        return;
    }

    setBusy(true);
    try {
        const me = await notionRequest('/users/me');
        const workspace = (me.bot && me.bot.workspace_name) ? me.bot.workspace_name : '';
        setStatus('Notion OK: ' + (me.name || 'bot') + (workspace ? ' (' + workspace + ')' : ''), 'ok');

        for (const category of Object.keys(DB_KEYS)) {
            const databaseId = settings[DB_KEYS[category]];
            if (!databaseId) {
                setStatus(CAT_LABELS[category] + ': Р±Р°Р·Р° РЅРµ СѓРєР°Р·Р°РЅР°', 'muted');
                continue;
            }
            try {
                const db = await notionRequest('/databases/' + databaseId);
                const title = (db.title || []).map(function (part) {
                    return part.plain_text;
                }).join('');
                setStatus(CAT_LABELS[category] + ': ' + (title || databaseId) + ' вЂ” РѕРє', 'ok');
            } catch (err) {
                setStatus(CAT_LABELS[category] + ': ' + err.message, 'error');
            }
        }
    } catch (err) {
        setStatus('РћС€РёР±РєР° РїРѕРґРєР»СЋС‡РµРЅРёСЏ: ' + err.message, 'error');
    } finally {
        setBusy(false);
    }
}

const DB_TITLES = {
    lorebooks: 'вњ¦ Lorebooks вњ¦',
    characters: 'вњ¦ Characters вњ¦',
    personas: 'вњ¦ Personas вњ¦',
    chats: 'вњ¦ Chats вњ¦',
};

/**
 * Words that identify a category even if the database was renamed
 * (for example "вњ¦ Lorebook Sync вњ¦" instead of "вњ¦ Lorebooks вњ¦").
 */
const DB_MATCH_KEYS = {
    lorebooks: ['lorebook'],
    characters: ['character'],
    personas: ['persona'],
    chats: ['chat'],
};

let databaseListCache = null;

function normalizeTitle(value) {
    return String(value == null ? '' : value)
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, '');
}

async function listAllDatabases() {
    if (databaseListCache) {
        return databaseListCache;
    }

    const items = [];
    let cursor = undefined;

    for (;;) {
        const body = { filter: { value: 'database', property: 'object' }, page_size: 100 };
        if (cursor) {
            body.start_cursor = cursor;
        }
        const data = await notionRequest('/search', { method: 'POST', body });
        for (const item of (data.results || [])) {
            items.push({
                id: item.id,
                title: (item.title || []).map(function (part) {
                    return part.plain_text || '';
                }).join('').trim(),
            });
        }
        if (!data.has_more) {
            break;
        }
        cursor = data.next_cursor;
    }

    databaseListCache = items;
    return items;
}

function matchDatabase(category, databases) {
    const wanted = normalizeTitle(DB_TITLES[category]);
    const exact = databases.find(function (db) {
        return normalizeTitle(db.title) === wanted;
    });
    if (exact) {
        return { db: exact, how: 'exact' };
    }

    const keys = DB_MATCH_KEYS[category];
    const loose = databases.filter(function (db) {
        const name = normalizeTitle(db.title);
        return Boolean(name) && keys.some(function (key) {
            return name.includes(key);
        });
    });

    if (loose.length === 1) {
        return { db: loose[0], how: 'loose' };
    }
    if (loose.length > 1) {
        return { ambiguous: loose };
    }
    return null;
}

/**
 * Fill empty database fields from what the integration can see.
 * Never creates anything and never overwrites a configured id.
 */
async function findDatabasesByTitle() {
    const settings = getSettings();
    if (!settings.token) {
        setStatus('РЎРЅР°С‡Р°Р»Р° СѓРєР°Р¶РёС‚Рµ Notion integration token.', 'error');
        return;
    }

    const empty = Object.keys(DB_KEYS).filter(function (category) {
        return !settings[DB_KEYS[category]];
    });

    if (!empty.length) {
        setStatus('рџ”Ќ Р’СЃРµ С‡РµС‚С‹СЂРµ Р±Р°Р·С‹ СѓР¶Рµ СѓРєР°Р·Р°РЅС‹ вЂ” РёСЃРєР°С‚СЊ РЅРµС‡РµРіРѕ.', 'muted');
        return;
    }

    setBusy(true);
    setStatus('рџ”Ќ РџРѕРёСЃРє Р±Р°Р· РІ Notion: СЃС‚Р°СЂС‚', 'info');

    try {
        databaseListCache = null;
        const databases = await listAllDatabases();
        setStatus('рџ”Ќ РРЅС‚РµРіСЂР°С†РёРё РІРёРґРЅС‹ Р±Р°Р·: ' + databases.length, 'info');

        let found = 0;
        let notFound = 0;

        for (const category of empty) {
            const match = matchDatabase(category, databases);

            if (match && match.db) {
                settings[DB_KEYS[category]] = match.db.id;
                setDbField(category, match.db.id);
                found++;
                setStatus('вњ“ ' + CAT_LABELS[category] + ': ' + match.db.title
                    + ' (' + shortId(match.db.id) + ')', 'ok');
                continue;
            }

            notFound++;

            if (match && match.ambiguous) {
                const names = match.ambiguous.map(function (db) {
                    return db.title || shortId(db.id);
                }).join(', ');
                setStatus('? ' + CAT_LABELS[category] + ': РЅРµСЃРєРѕР»СЊРєРѕ РїРѕРґС…РѕРґСЏС‰РёС… вЂ” ' + names, 'error');
                continue;
            }

            setStatus('вњ— ' + CAT_LABELS[category] + ': Р±Р°Р·Р° РЅРµ РЅР°Р№РґРµРЅР°', 'error');
        }

        persist();

        if (found) {
            setStatus('рџ”Ќ Р“РѕС‚РѕРІРѕ: РїРѕРґСЃС‚Р°РІР»РµРЅРѕ ' + found
                + (notFound ? ', РЅРµ РЅР°Р№РґРµРЅРѕ вЂ” ' + notFound : ''), 'ok');
        } else {
            setStatus('рџ”Ќ РќРёС‡РµРіРѕ РЅРµ РЅР°С€Р»Рё. РџСЂРѕРІРµСЂСЊС‚Рµ, С‡С‚Рѕ Р±Р°Р·Р° СЂР°СЃС€Р°СЂРµРЅР° РЅР° РёРЅС‚РµРіСЂР°С†РёСЋ:'
                + ' Р±Р°Р·Р° в†’ вЂўвЂўвЂў в†’ Connections.', 'error');
        }

        if (notFound) {
            setStatus('рџ”Ќ РќРµРґРѕСЃС‚Р°СЋС‰РёРµ Р±Р°Р·С‹ РјРѕР¶РЅРѕ СЃРѕР·РґР°С‚СЊ РєРЅРѕРїРєРѕР№ В«РЎРѕР·РґР°С‚СЊ РЅРµРґРѕСЃС‚Р°СЋС‰РёРµ Р±Р°Р·С‹В».', 'muted');
        }
    } catch (err) {
        setStatus('рџ”Ќ РџРѕРёСЃРє: ' + err.message, 'error');
    } finally {
        setBusy(false);
    }
}


/**
 * Databases live under a Notion page. Reuse the page of any configured
 * database, or the page id the user pasted manually.
 */
async function resolveParentPageId() {
    const settings = getSettings();
    if (settings.parentPageId) {
        return settings.parentPageId;
    }
    for (const category of Object.keys(DB_KEYS)) {
        const databaseId = settings[DB_KEYS[category]];
        if (!databaseId) {
            continue;
        }
        try {
            const db = await notionRequest('/databases/' + databaseId);
            if (db.parent && db.parent.type === 'page_id') {
                return db.parent.page_id;
            }
        } catch (err) {
            // Try the next configured database.
        }
    }
    return null;
}

async function createMissingDatabases() {
    const settings = getSettings();
    if (!settings.token) {
        setStatus('РЎРЅР°С‡Р°Р»Р° СѓРєР°Р¶РёС‚Рµ Notion integration token.', 'error');
        return;
    }

    const missing = Object.keys(DB_KEYS).filter(function (category) {
        return !settings[DB_KEYS[category]];
    });

    if (!missing.length) {
        setStatus('Р’СЃРµ С‡РµС‚С‹СЂРµ Р±Р°Р·С‹ СѓР¶Рµ СѓРєР°Р·Р°РЅС‹ вЂ” СЃРѕР·РґР°РІР°С‚СЊ РЅРµС‡РµРіРѕ.', 'muted');
        return;
    }

    setBusy(true);
    setProgress('РЎРѕР·РґР°СЋ Р±Р°Р·С‹ Notion...');
    setStatus('в–¶ РЎРѕР·РґР°С‚СЊ РЅРµРґРѕСЃС‚Р°СЋС‰РёРµ Р±Р°Р·С‹: СЃС‚Р°СЂС‚', 'info');

    try {
        for (const category of missing) {
            const match = matchDatabase(category, await listAllDatabases());

            if (match && match.db) {
                settings[DB_KEYS[category]] = match.db.id;
                setDbField(category, match.db.id);
                setStatus('= ' + (match.db.title || DB_TITLES[category]) + ': РЅР°Р№РґРµРЅР° РіРѕС‚РѕРІР°СЏ ('
                    + shortId(match.db.id) + ')', 'info');
                continue;
            }

            if (match && match.ambiguous) {
                const names = match.ambiguous.map(function (db) {
                    return db.title || shortId(db.id);
                }).join(', ');
                setStatus('? ' + CAT_LABELS[category] + ': РЅРµСЃРєРѕР»СЊРєРѕ РїРѕРґС…РѕРґСЏС‰РёС… Р±Р°Р· вЂ” ' + names
                    + '. РЈРєР°Р¶РёС‚Рµ ID РІСЂСѓС‡РЅСѓСЋ.', 'error');
                continue;
            }

            const parentPageId = await resolveParentPageId();
            if (!parentPageId) {
                throw new Error('РЅРµ РЅР°С€Р»Р° СЃС‚СЂР°РЅРёС†Сѓ-СЂРѕРґРёС‚РµР»СЏ. РЈРєР°Р¶РёС‚Рµ ID СЃС‚СЂР°РЅРёС†С‹ Notion РЅРёР¶Рµ.');
            }

            const created = await notionRequest('/databases', {
                method: 'POST',
                body: {
                    parent: { type: 'page_id', page_id: parentPageId },
                    title: [{ type: 'text', text: { content: DB_TITLES[category] } }],
                    properties: { Name: { title: {} } },
                },
            });
            settings[DB_KEYS[category]] = created.id;
            setDbField(category, created.id);
            databaseListCache = null;
            setStatus('+ ' + DB_TITLES[category] + ': СЃРѕР·РґР°РЅР° (' + shortId(created.id) + ')', 'ok');
        }

        persist();

        for (const category of missing) {
            const value = getSettings()[DB_KEYS[category]];
            setDbField(category, value || '');
            setStatus('  ' + CAT_LABELS[category] + ': ' + (value ? shortId(value) : 'РїСѓСЃС‚Рѕ'), value ? 'ok' : 'error');
        }

        setStatus('Р“РѕС‚РѕРІРѕ: РїСЂРѕРІРµСЂРµРЅРѕ РєР°С‚РµРіРѕСЂРёР№ вЂ” ' + missing.length, 'ok');
    } catch (err) {
        setStatus('РќРµ СѓРґР°Р»РѕСЃСЊ СЃРѕР·РґР°С‚СЊ Р±Р°Р·С‹: ' + err.message, 'error');
    } finally {
        setProgress('');
        setBusy(false);
    }
}

let autoFillDone = false;

async function autoFillMissingDatabases() {
    if (autoFillDone) {
        return;
    }
    autoFillDone = true;

    const settings = getSettings();
    if (!settings.token) {
        return;
    }

    const missing = Object.keys(DB_KEYS).filter(function (category) {
        return !settings[DB_KEYS[category]];
    });
    if (!missing.length) {
        return;
    }

    try {
        const databases = await listAllDatabases();
        for (const category of missing) {
            const match = matchDatabase(category, databases);
            if (match && match.db) {
                settings[DB_KEYS[category]] = match.db.id;
                setDbField(category, match.db.id);
                setStatus('РђРІС‚РѕРїРѕРёСЃРє: ' + CAT_LABELS[category] + ' в†’ ' + (match.db.title || shortId(match.db.id)), 'info');
            } else {
                setStatus('РђРІС‚РѕРїРѕРёСЃРє: ' + CAT_LABELS[category]
                    + ' РЅРµ РЅР°Р№РґРµРЅР° вЂ” РЅР°Р¶РјРёС‚Рµ В«РќР°Р№С‚Рё Р±Р°Р·С‹ РїРѕ РЅР°Р·РІР°РЅРёСЋВ»', 'muted');
            }
        }
    } catch (err) {
        setStatus('РђРІС‚РѕРїРѕРёСЃРє: ' + err.message, 'error');
        return;
    }

    persist();
}

async function restoreLorebooks() {
    const settings = getSettings();
    const pages = await listDatabasePages(settings.lorebooksDb);
    const existing = new Set((await listLorebooks()).map(function (book) {
        return book.name;
    }));

    let ok = 0;
    let failed = 0;
    let skipped = 0;

    for (const page of pages) {
        const title = pageTitle(page);
        try {
            const snapshot = await readSnapshot(page.id);
            if (!snapshot || snapshot.kind !== 'lorebook' || !snapshot.entries) {
                setStatus('в¬‡ ' + title + ': РЅРµС‚ СЃРЅРёРјРєР°, РїСЂРѕРїСѓСЃРє', 'muted');
                skipped++;
                continue;
            }

            const name = snapshot.name || title;
            if (!settings.importOverwrite && existing.has(name)) {
                setStatus('в¬‡ ' + name + ': СѓР¶Рµ РµСЃС‚СЊ РІ РўР°РІРµСЂРЅРµ, РїСЂРѕРїСѓСЃРє', 'muted');
                skipped++;
                continue;
            }

            const response = await fetch('/api/worldinfo/edit', {
                method: 'POST',
                headers: getRequestHeaders(),
                body: JSON.stringify({ name, data: { entries: snapshot.entries } }),
            });
            if (!response.ok) {
                throw new Error('worldinfo/edit: HTTP ' + response.status);
            }

            setStatus('в¬‡ ' + name + ': РІРѕСЃСЃС‚Р°РЅРѕРІР»РµРЅ', 'ok');
            ok++;
        } catch (err) {
            failed++;
            setStatus('в¬‡ ' + title + ': ' + err.message, 'error');
        }
    }

    return { ok, failed, skipped };
}

async function restoreCharacters() {
    const settings = getSettings();
    const pages = await listDatabasePages(settings.charactersDb);
    const characters = getContext().characters || [];

    let ok = 0;
    let failed = 0;
    let skipped = 0;

    for (const page of pages) {
        const title = pageTitle(page);
        try {
            const snapshot = await readSnapshot(page.id);
            if (!snapshot || snapshot.kind !== 'character' || !snapshot.fields) {
                setStatus('в¬‡ ' + title + ': РЅРµС‚ СЃРЅРёРјРєР°, РїСЂРѕРїСѓСЃРє', 'muted');
                skipped++;
                continue;
            }

            const name = snapshot.name || title;
            const character = characters.find(function (item) {
                return item.name === name;
            });
            if (!character) {
                setStatus('в¬‡ ' + name + ': РЅРµС‚ С‚Р°РєРѕРіРѕ РїРµСЂСЃРѕРЅР°Р¶Р° РІ РўР°РІРµСЂРЅРµ, РїСЂРѕРїСѓСЃРє', 'muted');
                skipped++;
                continue;
            }

            let changed = 0;
            for (const field of CHARACTER_FIELDS) {
                if (!Object.hasOwn(snapshot.fields, field)) {
                    continue;
                }
                const value = snapshot.fields[field] == null ? '' : snapshot.fields[field];
                const current = character[field] == null ? '' : character[field];
                if (String(current) === String(value)) {
                    continue;
                }
                if (!settings.importOverwrite && String(current).trim()) {
                    continue;
                }

                const response = await fetch('/api/characters/edit-attribute', {
                    method: 'POST',
                    headers: getRequestHeaders(),
                    body: JSON.stringify({
                        avatar_url: character.avatar,
                        ch_name: character.name,
                        field,
                        value,
                    }),
                });
                if (!response.ok) {
                    throw new Error('edit-attribute ' + field + ': HTTP ' + response.status);
                }
                character[field] = value;
                changed++;
            }

            if (changed > 0) {
                setStatus('в¬‡ ' + name + ': РѕР±РЅРѕРІР»РµРЅРѕ РїРѕР»РµР№ вЂ” ' + changed, 'ok');
                ok++;
            } else {
                setStatus('в¬‡ ' + name + ': Р±РµР· РёР·РјРµРЅРµРЅРёР№', 'muted');
                skipped++;
            }
        } catch (err) {
            failed++;
            setStatus('в¬‡ ' + title + ': ' + err.message, 'error');
        }
    }

    return { ok, failed, skipped };
}

async function runImport(category) {
    const settings = getSettings();
    if (!settings.token) {
        setStatus('РЎРЅР°С‡Р°Р»Р° СѓРєР°Р¶РёС‚Рµ Notion integration token.', 'error');
        return;
    }

    const databaseId = category === 'lorebooks' ? settings.lorebooksDb : settings.charactersDb;
    if (!databaseId) {
        setStatus(CAT_LABELS[category] + ': СѓРєР°Р¶РёС‚Рµ database ID.', 'error');
        return;
    }

    setBusy(true);
    setStatus('в¬‡ РРјРїРѕСЂС‚: ' + CAT_LABELS[category] + ' вЂ” СЃС‚Р°СЂС‚', 'info');

    try {
        const result = category === 'lorebooks' ? await restoreLorebooks() : await restoreCharacters();
        setStatus('в¬‡ РРјРїРѕСЂС‚ Р·Р°РІРµСЂС€С‘РЅ: ' + summaryLine(result), result.failed > 0 ? 'error' : 'ok');
        setStatus('вџі РћР±РЅРѕРІРёС‚Рµ СЃС‚СЂР°РЅРёС†Сѓ РўР°РІРµСЂРЅС‹ (F5), С‡С‚РѕР±С‹ СѓРІРёРґРµС‚СЊ РёР·РјРµРЅРµРЅРёСЏ.', 'muted');
    } catch (err) {
        setStatus('в¬‡ РРјРїРѕСЂС‚: ' + err.message, 'error');
    } finally {
        setBusy(false);
    }
}

let autoSyncCounter = 0;
let autoSyncRunning = false;

function updateAutoState() {
    const element = jQuery('#ls_auto_state');
    if (!element.length) {
        return;
    }
    const settings = getSettings();
    if (!settings.autoSyncEnabled) {
        element.text('');
        return;
    }
    const every = Math.max(1, Number(settings.autoSyncEvery) || 10);
    element.text(autoSyncCounter + ' / ' + every);
}

/* ------------------------------------------------------------------ */
/* Markdown export (Obsidian vault)                                    */
/* ------------------------------------------------------------------ */

const CAT_FOLDERS = {
    lorebooks: 'Lorebooks',
    characters: 'Characters',
    personas: 'Personas',
    chats: 'Chats',
};

const ZIP_CRC_TABLE = (function () {
    const table = new Uint32Array(256);
    for (let index = 0; index < 256; index++) {
        let value = index;
        for (let bit = 0; bit < 8; bit++) {
            value = (value & 1) ? (0xEDB88320 ^ (value >>> 1)) : (value >>> 1);
        }
        table[index] = value >>> 0;
    }
    return table;
})();

function crc32(bytes) {
    let crc = 0xFFFFFFFF;
    for (let index = 0; index < bytes.length; index++) {
        crc = ZIP_CRC_TABLE[(crc ^ bytes[index]) & 0xFF] ^ (crc >>> 8);
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
}

function utf8Bytes(text) {
    return new TextEncoder().encode(text);
}

/**
 * Minimal ZIP writer (stored, no compression) so the export needs no libraries.
 */
function buildZip(files) {
    const chunks = [];
    const central = [];
    let offset = 0;

    for (const file of files) {
        const nameBytes = utf8Bytes(file.path);
        const dataBytes = utf8Bytes(file.content);
        const crc = crc32(dataBytes);
        const size = dataBytes.length;

        const local = new Uint8Array(30 + nameBytes.length);
        const localView = new DataView(local.buffer);
        localView.setUint32(0, 0x04034b50, true);
        localView.setUint16(4, 20, true);
        localView.setUint16(6, 0x0800, true);
        localView.setUint16(8, 0, true);
        localView.setUint16(10, 0, true);
        localView.setUint16(12, 0x21, true);
        localView.setUint32(14, crc, true);
        localView.setUint32(18, size, true);
        localView.setUint32(22, size, true);
        localView.setUint16(26, nameBytes.length, true);
        localView.setUint16(28, 0, true);
        local.set(nameBytes, 30);

        chunks.push(local, dataBytes);

        const entry = new Uint8Array(46 + nameBytes.length);
        const entryView = new DataView(entry.buffer);
        entryView.setUint32(0, 0x02014b50, true);
        entryView.setUint16(4, 20, true);
        entryView.setUint16(6, 20, true);
        entryView.setUint16(8, 0x0800, true);
        entryView.setUint16(10, 0, true);
        entryView.setUint16(12, 0, true);
        entryView.setUint16(14, 0x21, true);
        entryView.setUint32(16, crc, true);
        entryView.setUint32(20, size, true);
        entryView.setUint32(24, size, true);
        entryView.setUint16(28, nameBytes.length, true);
        entryView.setUint32(42, offset, true);
        entry.set(nameBytes, 46);
        central.push(entry);

        offset += local.length + size;
    }

    const centralSize = central.reduce(function (sum, part) {
        return sum + part.length;
    }, 0);

    const end = new Uint8Array(22);
    const endView = new DataView(end.buffer);
    endView.setUint32(0, 0x06054b50, true);
    endView.setUint16(8, files.length, true);
    endView.setUint16(10, files.length, true);
    endView.setUint32(12, centralSize, true);
    endView.setUint32(16, offset, true);

    return new Blob(chunks.concat(central, [end]), { type: 'application/zip' });
}

function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () {
        URL.revokeObjectURL(url);
    }, 10000);
}

function yamlString(value) {
    return '"' + String(value == null ? '' : value)
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"') + '"';
}

function safeFileName(title) {
    const cleaned = String(title || 'Untitled')
        .replace(/[\\/:*?"<>|#^[\]]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    return (cleaned || 'Untitled').slice(0, 120);
}

function notionBlocksToMarkdown(blocks) {
    const lines = [];

    for (const block of blocks) {
        if (block.type === 'code' && String(block.text || '').startsWith(SNAPSHOT_PREFIX)) {
            continue;
        }

        const text = String(block.text || '').trim();
        if (!text) {
            continue;
        }

        switch (block.type) {
            case 'heading_1': lines.push('# ' + text); break;
            case 'heading_2': lines.push('## ' + text); break;
            case 'heading_3': lines.push('### ' + text); break;
            case 'bulleted_list_item': lines.push('- ' + text); break;
            case 'numbered_list_item': lines.push('1. ' + text); break;
            case 'quote':
            case 'callout': lines.push('> ' + text); break;
            case 'to_do': lines.push('- [ ] ' + text); break;
            case 'code': lines.push('```\n' + text + '\n```'); break;
            case 'divider': lines.push('---'); break;
            default: lines.push(text);
        }

        lines.push('');
    }

    return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

async function exportDatabase(category, settings) {
    const databaseId = settings[DB_KEYS[category]];
    if (!databaseId) {
        setStatus('рџ“¦ ' + CAT_LABELS[category] + ': database ID РЅРµ Р·Р°РґР°РЅ вЂ” РїСЂРѕРїСѓСЃРє', 'muted');
        return { files: [], pages: 0 };
    }

    const pages = await listDatabasePages(databaseId);
    const files = [];
    const used = new Set();
    let done = 0;

    for (const page of pages) {
        done++;
        const title = pageTitle(page);
        setProgress('рџ“¦ ' + CAT_LABELS[category] + ': ' + done + ' / ' + pages.length);

        let name = safeFileName(title);
        if (used.has(name)) {
            let suffix = 2;
            while (used.has(name + ' (' + suffix + ')')) {
                suffix++;
            }
            name = name + ' (' + suffix + ')';
        }
        used.add(name);

        const blocks = await listChildBlocks(page.id);
        const header = [
            '---',
            'title: ' + yamlString(title),
            'category: ' + yamlString(category),
            'notion_id: ' + yamlString(page.id),
            'notion_url: ' + yamlString(page.url || ''),
            'last_edited: ' + yamlString(page.last_edited_time || ''),
            '---',
            '',
            '# ' + title,
            '',
        ].join('\n');

        files.push({
            path: CAT_FOLDERS[category] + '/' + name + '.md',
            content: header + notionBlocksToMarkdown(blocks),
        });
    }

    setProgress('');
    return { files, pages: pages.length };
}

async function runExport() {
    const settings = getSettings();
    if (!settings.token) {
        setStatus('РЎРЅР°С‡Р°Р»Р° СѓРєР°Р¶РёС‚Рµ Notion integration token.', 'error');
        return;
    }

    const categories = ['lorebooks', 'characters', 'personas'];
    if (settings.exportChats) {
        categories.push('chats');
    }

    setBusy(true);
    setStatus('рџ“¦ Р­РєСЃРїРѕСЂС‚ РІ Markdown: СЃС‚Р°СЂС‚', 'info');

    try {
        const files = [];
        let totalPages = 0;

        for (const category of categories) {
            const result = await exportDatabase(category, settings);
            files.push.apply(files, result.files);
            totalPages += result.pages;
            setStatus('рџ“¦ ' + CAT_LABELS[category] + ': СЃС‚СЂР°РЅРёС† вЂ” ' + result.pages, 'ok');
        }

        if (files.length === 0) {
            setStatus('рџ“¦ РќРµС‡РµРіРѕ СЌРєСЃРїРѕСЂС‚РёСЂРѕРІР°С‚СЊ: Р±Р°Р·С‹ РїСѓСЃС‚С‹.', 'muted');
            return;
        }

        const stamp = new Date().toISOString().slice(0, 10);
        downloadBlob(buildZip(files), 'lorebook-sync-' + stamp + '.zip');
        setStatus('рџ“¦ Р“РѕС‚РѕРІРѕ: ' + files.length + ' С„Р°Р№Р»РѕРІ РёР· ' + totalPages + ' СЃС‚СЂР°РЅРёС† вЂ” Р°СЂС…РёРІ СЃРєР°С‡Р°РЅ.', 'ok');
        setStatus('рџ“¦ Р Р°СЃРїР°РєСѓР№С‚Рµ Р°СЂС…РёРІ РІ РїР°РїРєСѓ vault Obsidian.', 'muted');
    } catch (err) {
        setStatus('рџ“¦ Р­РєСЃРїРѕСЂС‚: ' + err.message, 'error');
    } finally {
        setProgress('');
        setBusy(false);
    }
}

/* ------------------------------------------------------------------ */
/* UI wiring                                                           */
/* ------------------------------------------------------------------ */

function bindDbInput(category) {
    const selector = '.lorebook-sync-settings [data-dbcat="' + category + '"], #ls_db_' + category;
    jQuery(selector)
        .val(getSettings()[DB_KEYS[category]])
        .on('input', function () {
            getSettings()[DB_KEYS[category]] = String(jQuery(this).val()).trim();
            persist();
        });
}

function bindUi() {
    const settings = getSettings();

    jQuery('#ls_token')
        .val(settings.token)
        .on('input', function () {
            settings.token = String(jQuery(this).val()).trim();
            persist();
        });

    jQuery('#ls_toggle_token').on('click', function () {
        const field = jQuery('#ls_token');
        const hidden = field.attr('type') === 'password';
        field.attr('type', hidden ? 'text' : 'password');
        jQuery(this).text(hidden ? t('hide') : t('show'));
    });

    for (const category of Object.keys(DB_KEYS)) {
        bindDbInput(category);
    }

    jQuery('#ls_include_empty')
        .prop('checked', Boolean(settings.includeEmpty))
        .on('change', function () {
            settings.includeEmpty = Boolean(jQuery(this).prop('checked'));
            persist();
        });

    jQuery('#ls_chat_limit')
        .val(settings.chatLimit)
        .on('input', function () {
            settings.chatLimit = Math.max(1, Number(jQuery(this).val()) || 1);
            persist();
        });

    jQuery('#ls_msg_limit')
        .val(settings.msgLimit)
        .on('input', function () {
            settings.msgLimit = Math.max(1, Number(jQuery(this).val()) || 1);
            persist();
        });

    jQuery('#ls_rewrite_chats')
        .prop('checked', Boolean(settings.rewriteChats))
        .on('change', function () {
            settings.rewriteChats = Boolean(jQuery(this).prop('checked'));
            persist();
        });

    jQuery('#ls_auto_sync')
        .prop('checked', Boolean(settings.autoSyncEnabled))
        .on('change', function () {
            settings.autoSyncEnabled = Boolean(jQuery(this).prop('checked'));
            autoSyncCounter = 0;
            updateAutoState();
            persist();
        });

    jQuery('#ls_auto_every')
        .val(settings.autoSyncEvery)
        .on('input', function () {
            settings.autoSyncEvery = Math.max(1, Number(jQuery(this).val()) || 1);
            updateAutoState();
            persist();
        });

    jQuery('#ls_upload_avatars')
        .prop('checked', Boolean(settings.uploadAvatars))
        .on('change', function () {
            settings.uploadAvatars = Boolean(jQuery(this).prop('checked'));
            persist();
        });

    jQuery('#ls_import_overwrite')
        .prop('checked', Boolean(settings.importOverwrite))
        .on('change', function () {
            settings.importOverwrite = Boolean(jQuery(this).prop('checked'));
            persist();
        });

    jQuery('#ls_restore_lorebooks').on('click', function () {
        runImport('lorebooks');
    });

    jQuery('#ls_restore_characters').on('click', function () {
        runImport('characters');
    });

    jQuery('#ls_export_chats')
        .prop('checked', Boolean(settings.exportChats))
        .on('change', function () {
            settings.exportChats = Boolean(jQuery(this).prop('checked'));
            persist();
        });

    jQuery('#ls_export_md').on('click', runExport);

    updateAutoState();

    jQuery('#ls_test').on('click', testConnection);
    jQuery('#ls_sync_all').on('click', syncAll);
    jQuery('#ls_create_dbs').on('click', createMissingDatabases);
    jQuery('#ls_find_dbs').on('click', findDatabasesByTitle);

    jQuery('#ls_version').text('v' + EXT_VERSION);

    jQuery('.lorebook-sync-settings .ls-lang').on('click', function () {
        settings.lang = String(jQuery(this).attr('data-ls-lang') || 'ru');
        applyLanguage();
        persist();
    });

    applyLanguage();

    jQuery('#ls_parent_page')
        .val(settings.parentPageId)
        .on('input', function () {
            settings.parentPageId = String(jQuery(this).val()).trim();
            persist();
        });

    jQuery('.ls-sync-btn').on('click', function () {
        const category = jQuery(this).data('cat');
        if (category) {
            runCategory(category);
        }
    });
}

if (eventSource && event_types && event_types.MESSAGE_RECEIVED) {
    eventSource.on(event_types.MESSAGE_RECEIVED, autoSyncTick);
}

jQuery(async function () {
    try {
        const html = await getContext().renderExtensionTemplateAsync(
            'third-party/lorebook-sync',
            'settings',
        );
        jQuery('#extensions_settings2').append(html);
        bindUi();
        setStatus('Lorebook Sync v' + EXT_VERSION + ': РіРѕС‚РѕРІ', 'muted');
        console.log('Lorebook Sync: ready v' + EXT_VERSION);
        autoFillMissingDatabases();
    } catch (err) {
        console.error('Lorebook Sync: failed to render settings', err);
    }
});
