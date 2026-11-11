/**
 * Lorebook Sync — SillyTavern extension
 * Syncs lorebooks, characters, personas and chats to Notion databases.
 *
 * v0.2: four independent categories, each with its own Notion database.
 */

import { extension_settings, getContext } from '../../../extensions.js';
import { getRequestHeaders, eventSource, event_types } from '../../../../script.js';

const MODULE_NAME = 'lorebook-sync';
const EXT_VERSION = '0.5.1';

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
    lorebooks: 'Лорбуки',
    characters: 'Персонажи',
    personas: 'Персоны',
    chats: 'Чаты',
};

const LANGS = ['ru', 'en', 'uk', 'sv'];

const I18N = {
    ru: {
        desc: 'Синхронизация данных SillyTavern в базы Notion.',
        show: 'Show',
        hide: 'Hide',
        test: 'Проверить связь',
        syncAll: 'Синхронизировать всё',
        create: 'Создать недостающие базы',
        parentLabel: 'ID страницы Notion для новых баз (необязательно)',
        parentPlaceholder: 'page id',
        databases: 'Базы Notion',
        lorebooks: '📚 Лорбуки',
        characters: '🎭 Персонажи',
        personas: '🧑 Персоны',
        chats: '💬 Чаты',
        includeEmpty: 'включать пустые лорбуки',
        chatLimit: 'чатов на персонажа',
        msgLimit: 'сообщений в чате',
        rewriteChats: 'перезаписывать чаты целиком',
        autoTitle: '🤖 Авто-синхронизация',
        autoEnable: 'авто-синхронизация активного чата',
        autoEvery: 'каждые N сообщений',
        dbPlaceholder: 'database id',
    },
    en: {
        desc: 'Sync SillyTavern data to Notion databases.',
        show: 'Show',
        hide: 'Hide',
        test: 'Test connection',
        syncAll: 'Sync all',
        create: 'Create missing databases',
        parentLabel: 'Notion page ID for new databases (optional)',
        parentPlaceholder: 'page id',
        databases: 'Notion databases',
        lorebooks: '📚 Lorebooks',
        characters: '🎭 Characters',
        personas: '🧑 Personas',
        chats: '💬 Chats',
        includeEmpty: 'include empty lorebooks',
        chatLimit: 'chats per character',
        msgLimit: 'messages per chat',
        rewriteChats: 'rewrite chats fully',
        autoTitle: '🤖 Auto-sync',
        autoEnable: 'auto-sync the active chat',
        autoEvery: 'every N messages',
        dbPlaceholder: 'database id',
    },
    uk: {
        desc: 'Синхронізація даних SillyTavern у бази Notion.',
        show: 'Show',
        hide: 'Hide',
        test: 'Перевірити звʼязок',
        syncAll: 'Синхронізувати все',
        create: 'Створити відсутні бази',
        parentLabel: 'ID сторінки Notion для нових баз (необовʼязково)',
        parentPlaceholder: 'page id',
        databases: 'Бази Notion',
        lorebooks: '📚 Лорбуки',
        characters: '🎭 Персонажі',
        personas: '🧑 Персони',
        chats: '💬 Чати',
        includeEmpty: 'включати порожні лорбуки',
        chatLimit: 'чатів на персонажа',
        msgLimit: 'повідомлень у чаті',
        rewriteChats: 'перезаписувати чати повністю',
        autoTitle: '🤖 Автосинхронізація',
        autoEnable: 'автосинхронізація активного чату',
        autoEvery: 'кожні N повідомлень',
        dbPlaceholder: 'database id',
    },
    sv: {
        desc: 'Synkronisera SillyTavern-data till Notion-databaser.',
        show: 'Show',
        hide: 'Hide',
        test: 'Testa anslutning',
        syncAll: 'Synka allt',
        create: 'Skapa saknade databaser',
        parentLabel: 'Notion-sid-ID för nya databaser (valfritt)',
        parentPlaceholder: 'page id',
        databases: 'Notion-databaser',
        lorebooks: '📚 Lorebooks',
        characters: '🎭 Karaktärer',
        personas: '🧑 Personer',
        chats: '💬 Chattar',
        includeEmpty: 'inkludera tomma lorebooks',
        chatLimit: 'chattar per karaktär',
        msgLimit: 'meddelanden per chatt',
        rewriteChats: 'skriv över chattar helt',
        autoTitle: '🤖 Autosynk',
        autoEnable: 'autosynka den aktiva chatten',
        autoEvery: 'var N:e meddelande',
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
    return value.length > 10 ? (value.slice(0, 8) + '…') : value;
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
    jQuery('.ls-sync-btn, #ls_test, #ls_sync_all, #ls_create_dbs')
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
    return '⟦ls:v1 ' + Object.keys(data).map(function (key) {
        return key + '=' + data[key];
    }).join(' ') + '⟧';
}

function parseMarker(text) {
    const match = /^⟦ls:v1\s+(.+?)⟧$/.exec(String(text || '').trim());
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
    const parts = [result.ok + ' обновлено'];
    if (result.skipped) {
        parts.push(result.skipped + ' без изменений');
    }
    parts.push(result.failed + ' ошибок');
    return parts.join(', ');
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
        const heading = primaryKeys && entry.comment ? (label + ' — ' + primaryKeys) : label;

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
        ['Описание', character.description],
        ['Личность', character.personality],
        ['Сценарий', character.scenario],
        ['Первое сообщение', character.first_mes],
        ['Примеры диалога', character.mes_example],
        ['Заметки автора', character.creator_notes],
        ['Системный промпт', character.system_prompt],
        ['Пост-инструкции', character.post_history_instructions],
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
        blocks.push(headingBlock('Альтернативные приветствия (' + greetings.length + ')'));
        greetings.forEach(function (greeting, index) {
            blocks.push(paragraphBlock((index + 1) + '. ' + greeting, false));
        });
    }

    if (Array.isArray(character.tags) && character.tags.length) {
        blocks.push(paragraphBlock('Теги: ' + character.tags.join(', '), true));
    }
    if (character.avatar) {
        blocks.push(paragraphBlock('Аватар: ' + character.avatar, true));
    }

    return blocks;
}

function personaBlocks(avatar, name, description) {
    const blocks = [];
    const info = description || {};
    if (info.title) {
        blocks.push(paragraphBlock('Заголовок: ' + info.title, true));
    }
    const text = (info.description || '').trim();
    if (text) {
        blocks.push(headingBlock('Описание'));
        blocks.push(paragraphBlock(text, false));
    }
    blocks.push(paragraphBlock('Аватар: ' + avatar, true));
    return blocks;
}

function chatBlocks(messages, limit) {
    const list = messages.filter(function (message) {
        return message && typeof message.mes === 'string' && message.mes.length > 0;
    });
    const tail = limit > 0 ? list.slice(-limit) : list;
    const blocks = [];

    if (limit > 0 && list.length > limit) {
        blocks.push(paragraphBlock('Показаны последние ' + limit + ' из ' + list.length + ' сообщений.', true));
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
    setStatus('Лорбуки: найдено ' + books.length, 'info');

    let ok = 0;
    let failed = 0;
    let skipped = 0;

    for (const book of books) {
        try {
            const data = await readLorebook(book.name);
            const entries = data.entries || {};
            const count = Object.keys(entries).length;

            if (count === 0 && !settings.includeEmpty) {
                setStatus('— ' + book.name + ': пустой, пропуск', 'muted');
                skipped++;
                continue;
            }

            const blocks = entryBlocks(entries);
            const signature = hashString(JSON.stringify(entries));

            const existing = await findPageByTitle(settings.lorebooksDb, book.name);
            if (existing) {
                const marker = readMarker(existing);
                if (marker && marker.kind === 'lorebook' && marker.hash === signature) {
                    setStatus('— ' + book.name + ': без изменений', 'muted');
                    skipped++;
                    continue;
                }
            }

            const pageId = await upsertPage(settings.lorebooksDb, book.name, blocks);
            await writeMarker(pageId, { kind: 'lorebook', hash: signature });
            setStatus('— ' + book.name + ': ' + count + ' записей', 'ok');
            ok++;
        } catch (err) {
            failed++;
            setStatus('— ' + book.name + ': ' + err.message, 'error');
        }
    }

    return { ok, failed, skipped };
}

async function syncCharacters() {
    const settings = getSettings();
    await ensureSyncProperty(settings.charactersDb);

    const characters = getContext().characters || [];
    setStatus('Персонажи: найдено ' + characters.length, 'info');

    let ok = 0;
    let failed = 0;
    let skipped = 0;

    for (const character of characters) {
        try {
            const name = character.name || 'Unnamed';
            const blocks = characterBlocks(character);
            const signature = hashString(JSON.stringify(blocks));

            const existing = await findPageByTitle(settings.charactersDb, name);
            if (existing) {
                const marker = readMarker(existing);
                if (marker && marker.kind === 'character' && marker.hash === signature) {
                    setStatus('— ' + name + ': без изменений', 'muted');
                    skipped++;
                    continue;
                }
            }

            const pageId = await upsertPage(settings.charactersDb, name, blocks);
            await writeMarker(pageId, { kind: 'character', hash: signature });
            setStatus('— ' + name + ': обновлён', 'ok');
            ok++;
        } catch (err) {
            failed++;
            setStatus('— ' + (character.name || '?') + ': ' + err.message, 'error');
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

    setStatus('Персоны: найдено ' + avatars.length, 'info');

    let ok = 0;
    let failed = 0;
    let skipped = 0;

    for (const avatar of avatars) {
        const name = personas[avatar] || avatar;
        try {
            const blocks = personaBlocks(avatar, name, descriptions[avatar]);
            const signature = hashString(JSON.stringify(blocks));

            const existing = await findPageByTitle(settings.personasDb, name);
            if (existing) {
                const marker = readMarker(existing);
                if (marker && marker.kind === 'persona' && marker.hash === signature) {
                    setStatus('— ' + name + ': без изменений', 'muted');
                    skipped++;
                    continue;
                }
            }

            const pageId = await upsertPage(settings.personasDb, name, blocks);
            await writeMarker(pageId, { kind: 'persona', hash: signature });
            setStatus('— ' + name + ': обновлён', 'ok');
            ok++;
        } catch (err) {
            failed++;
            setStatus('— ' + name + ': ' + err.message, 'error');
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
    const title = (character.name || 'Unnamed') + ' — ' + file.file_id;
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
    setStatus('Чаты: персонажей ' + characters.length, 'info');

    let ok = 0;
    let failed = 0;
    let skipped = 0;

    for (const character of characters) {
        let chats = [];
        try {
            chats = await listCharacterChats(character);
        } catch (err) {
            setStatus('— ' + character.name + ': список чатов недоступен', 'error');
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
                    setStatus('— ' + result.title + ': без изменений (' + result.total + ')', 'muted');
                    skipped++;
                } else if (result.status === 'updated') {
                    setStatus('— ' + result.title + ': +' + result.appended + ' сообщений (всего ' + result.total + ')', 'ok');
                    ok++;
                }
            } catch (err) {
                failed++;
                setStatus('— ' + (character.name || '?') + ': ' + err.message, 'error');
            }
        }
    }

    return { ok, failed, skipped };
}

let autoSyncCounter = 0;
let autoSyncRunning = false;

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
    if (autoSyncCounter < every) {
        return;
    }
    autoSyncCounter = 0;

    const context = getContext();
    const character = context.characters && context.characters[context.characterId];
    const chatFileId = context.chatId;

    if (!character || !character.avatar || !chatFileId) {
        setStatus('🤖 Авто-синк: активный одиночный чат не найден — пропуск', 'muted');
        return;
    }

    autoSyncRunning = true;
    setBusy(true);
    setStatus('🤖 Авто-синк: ' + every + ' сообщений → ' + (character.name || 'персонаж'), 'info');

    try {
        const result = await syncChatFile(character, { file_id: chatFileId }, settings);
        if (result.status === 'updated') {
            setStatus('🤖 Авто-синк: +' + result.appended + ' сообщений (всего ' + result.total + ')', 'ok');
        } else if (result.status === 'skipped') {
            setStatus('🤖 Авто-синк: без изменений', 'muted');
        }
    } catch (err) {
        setStatus('🤖 Авто-синк: ' + err.message, 'error');
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
        setStatus('Сначала укажите Notion integration token.', 'error');
        return;
    }
    if (!settings[DB_KEYS[category]]) {
        setStatus(CAT_LABELS[category] + ': укажите database ID.', 'error');
        return;
    }

    setBusy(true);
    setProgress('Синхронизация: ' + CAT_LABELS[category] + '...');
    setStatus('▶ ' + CAT_LABELS[category] + ': старт (база ' + shortId(settings[DB_KEYS[category]]) + ')', 'info');

    try {
        const result = await SYNC_FUNCTIONS[category]();
        settings.lastSync = new Date().toISOString();
        persist();
        setStatus(
            CAT_LABELS[category] + ': готово — ' + summaryLine(result),
            result.failed > 0 ? 'error' : 'ok',
        );
    } catch (err) {
        setStatus(CAT_LABELS[category] + ': ошибка — ' + err.message, 'error');
    } finally {
        setProgress('');
        setBusy(false);
    }
}

async function syncAll() {
    const settings = getSettings();
    if (!settings.token) {
        setStatus('Сначала укажите Notion integration token.', 'error');
        return;
    }

    const categories = Object.keys(DB_KEYS).filter(function (category) {
        return Boolean(settings[DB_KEYS[category]]);
    });

    if (!categories.length) {
        setStatus('Не указана ни одна база Notion.', 'error');
        return;
    }

    setBusy(true);
    setStatus('▶ Синхронизация всех категорий: старт (' + categories.length + ')', 'info');
    setStatus('⏳ Это может занять несколько минут — не закрывайте вкладку.', 'muted');

    let totalOk = 0;
    let totalFailed = 0;

    try {
        for (const category of categories) {
            setProgress('Синхронизация: ' + CAT_LABELS[category] + '...');
            setStatus('▶ ' + CAT_LABELS[category] + ': старт (база ' + shortId(settings[DB_KEYS[category]]) + ')', 'info');
            try {
                const result = await SYNC_FUNCTIONS[category]();
                totalOk += result.ok;
                totalFailed += result.failed;
                setStatus(
                    CAT_LABELS[category] + ': готово — ' + summaryLine(result),
                    result.failed > 0 ? 'error' : 'ok',
                );
            } catch (err) {
                totalFailed++;
                setStatus(CAT_LABELS[category] + ': ошибка — ' + err.message, 'error');
            }
        }

        settings.lastSync = new Date().toISOString();
        persist();
        setStatus(
            'Всё готово — ' + totalOk + ' страниц, ' + totalFailed + ' ошибок.',
            totalFailed > 0 ? 'error' : 'ok',
        );
    } catch (err) {
        setStatus('Синхронизация прервана: ' + err.message, 'error');
    } finally {
        setProgress('');
        setBusy(false);
        setStatus('⏹ Синхронизация завершена, кнопки снова активны.', 'muted');
    }
}

async function testConnection() {
    const settings = getSettings();
    if (!settings.token) {
        setStatus('Введите Notion integration token.', 'error');
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
                setStatus(CAT_LABELS[category] + ': база не указана', 'muted');
                continue;
            }
            try {
                const db = await notionRequest('/databases/' + databaseId);
                const title = (db.title || []).map(function (part) {
                    return part.plain_text;
                }).join('');
                setStatus(CAT_LABELS[category] + ': ' + (title || databaseId) + ' — ок', 'ok');
            } catch (err) {
                setStatus(CAT_LABELS[category] + ': ' + err.message, 'error');
            }
        }
    } catch (err) {
        setStatus('Ошибка подключения: ' + err.message, 'error');
    } finally {
        setBusy(false);
    }
}

const DB_TITLES = {
    lorebooks: '✦ Lorebooks ✦',
    characters: '✦ Characters ✦',
    personas: '✦ Personas ✦',
    chats: '✦ Chats ✦',
};

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

async function findDatabaseByTitle(title) {
    const data = await notionRequest('/search', {
        method: 'POST',
        body: {
            query: title,
            filter: { value: 'database', property: 'object' },
            page_size: 20,
        },
    });

    const normalized = String(title).trim();
    for (const item of (data.results || [])) {
        const name = (item.title || []).map(function (part) {
            return part.plain_text;
        }).join('').trim();
        if (name === normalized) {
            return item.id;
        }
    }
    return null;
}

async function createMissingDatabases() {
    const settings = getSettings();
    if (!settings.token) {
        setStatus('Сначала укажите Notion integration token.', 'error');
        return;
    }

    const missing = Object.keys(DB_KEYS).filter(function (category) {
        return !settings[DB_KEYS[category]];
    });

    if (!missing.length) {
        setStatus('Все четыре базы уже указаны — создавать нечего.', 'muted');
        return;
    }

    setBusy(true);
    setProgress('Создаю базы Notion...');
    setStatus('▶ Создать недостающие базы: старт', 'info');

    try {
        for (const category of missing) {
            const existing = await findDatabaseByTitle(DB_TITLES[category]);
            if (existing) {
                settings[DB_KEYS[category]] = existing;
                setDbField(category, existing);
                setStatus('= ' + DB_TITLES[category] + ': найдена готовая (' + shortId(existing) + ')', 'info');
                continue;
            }

            const parentPageId = await resolveParentPageId();
            if (!parentPageId) {
                throw new Error('не нашла страницу-родителя. Укажите ID страницы Notion ниже.');
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
            setStatus('+ ' + DB_TITLES[category] + ': создана (' + shortId(created.id) + ')', 'ok');
        }

        persist();

        for (const category of missing) {
            const value = getSettings()[DB_KEYS[category]];
            setDbField(category, value || '');
            setStatus('  ' + CAT_LABELS[category] + ': ' + (value ? shortId(value) : 'пусто'), value ? 'ok' : 'error');
        }

        setStatus('Готово: проверено категорий — ' + missing.length, 'ok');
    } catch (err) {
        setStatus('Не удалось создать базы: ' + err.message, 'error');
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

    for (const category of missing) {
        try {
            const existing = await findDatabaseByTitle(DB_TITLES[category]);
            if (existing) {
                settings[DB_KEYS[category]] = existing;
                setDbField(category, existing);
                setStatus('Автопоиск: ' + CAT_LABELS[category] + ' → ' + shortId(existing), 'info');
            } else {
                setStatus('Автопоиск: ' + CAT_LABELS[category] + ' не найдена — нажмите «Создать недостающие базы»', 'muted');
            }
        } catch (err) {
            setStatus('Автопоиск ' + CAT_LABELS[category] + ': ' + err.message, 'error');
            return;
        }
    }

    persist();
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
            persist();
        });

    jQuery('#ls_auto_every')
        .val(settings.autoSyncEvery)
        .on('input', function () {
            settings.autoSyncEvery = Math.max(1, Number(jQuery(this).val()) || 1);
            persist();
        });

    jQuery('#ls_test').on('click', testConnection);
    jQuery('#ls_sync_all').on('click', syncAll);
    jQuery('#ls_create_dbs').on('click', createMissingDatabases);

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
        setStatus('Lorebook Sync v' + EXT_VERSION + ': готов', 'muted');
        console.log('Lorebook Sync: ready v' + EXT_VERSION);
        autoFillMissingDatabases();
    } catch (err) {
        console.error('Lorebook Sync: failed to render settings', err);
    }
});
