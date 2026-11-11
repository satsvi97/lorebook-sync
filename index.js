/**
 * Lorebook Sync — SillyTavern extension
 * Syncs lorebooks, characters, personas and chats to Notion databases.
 *
 * v0.2: four independent categories, each with its own Notion database.
 */

import { extension_settings, getContext } from '../../../extensions.js';
import { getRequestHeaders } from '../../../../script.js';

const MODULE_NAME = 'lorebook-sync';
const EXT_VERSION = '0.3.1';
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

const defaultSettings = Object.freeze({
    enabled: true,
    token: '',
    lorebooksDb: DEFAULT_DATABASE_ID,
    charactersDb: '',
    personasDb: '',
    chatsDb: '',
    parentPageId: '',
    includeEmpty: false,
    chatLimit: 5,
    msgLimit: 300,
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
    getContext().saveSettingsDebounced();
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
    area.scrollTop(area[0].scrollHeight);
}

function setProgress(text) {
    jQuery('#ls_progress').text(text || '');
}

function setBusy(busy) {
    jQuery('.ls-sync-btn, #ls_test, #ls_sync_all, #ls_create_dbs')
        .toggleClass('disabled', busy)
        .attr('aria-disabled', busy ? 'true' : 'false');
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
    const books = await listLorebooks();
    setStatus('Лорбуки: найдено ' + books.length, 'info');

    let ok = 0;
    let failed = 0;

    for (const book of books) {
        try {
            const data = await readLorebook(book.name);
            const entries = data.entries || {};
            const count = Object.keys(entries).length;

            if (count === 0 && !settings.includeEmpty) {
                setStatus('— ' + book.name + ': пустой, пропуск', 'muted');
                continue;
            }

            await upsertPage(settings.lorebooksDb, book.name, entryBlocks(entries));
            setStatus('— ' + book.name + ': ' + count + ' записей', 'ok');
            ok++;
        } catch (err) {
            failed++;
            setStatus('— ' + book.name + ': ' + err.message, 'error');
        }
    }

    return { ok, failed };
}

async function syncCharacters() {
    const settings = getSettings();
    const characters = getContext().characters || [];
    setStatus('Персонажи: найдено ' + characters.length, 'info');

    let ok = 0;
    let failed = 0;

    for (const character of characters) {
        try {
            const name = character.name || 'Unnamed';
            await upsertPage(settings.charactersDb, name, characterBlocks(character));
            setStatus('— ' + name + ': ok', 'ok');
            ok++;
        } catch (err) {
            failed++;
            setStatus('— ' + (character.name || '?') + ': ' + err.message, 'error');
        }
    }

    return { ok, failed };
}

async function syncPersonas() {
    const settings = getSettings();
    const powerUser = getContext().powerUserSettings || {};
    const personas = powerUser.personas || {};
    const descriptions = powerUser.persona_descriptions || {};
    const avatars = Object.keys(personas);

    setStatus('Персоны: найдено ' + avatars.length, 'info');

    let ok = 0;
    let failed = 0;

    for (const avatar of avatars) {
        const name = personas[avatar] || avatar;
        try {
            await upsertPage(
                settings.personasDb,
                name,
                personaBlocks(avatar, name, descriptions[avatar]),
            );
            setStatus('— ' + name + ': ok', 'ok');
            ok++;
        } catch (err) {
            failed++;
            setStatus('— ' + name + ': ' + err.message, 'error');
        }
    }

    return { ok, failed };
}

async function syncChats() {
    const settings = getSettings();
    const characters = getContext().characters || [];
    setStatus('Чаты: персонажей ' + characters.length, 'info');

    let ok = 0;
    let failed = 0;

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
            const title = (character.name || 'Unnamed') + ' — ' + file.file_id;
            try {
                const messages = await readChat(character, file);
                const blocks = chatBlocks(messages, settings.msgLimit);
                if (!blocks.length) {
                    continue;
                }
                await upsertPage(settings.chatsDb, title, blocks);
                setStatus('— ' + title + ': ' + messages.length + ' сообщений', 'ok');
                ok++;
            } catch (err) {
                failed++;
                setStatus('— ' + title + ': ' + err.message, 'error');
            }
        }
    }

    return { ok, failed };
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
    setStatus('▶ ' + CAT_LABELS[category] + ': старт', 'info');

    try {
        const result = await SYNC_FUNCTIONS[category]();
        settings.lastSync = new Date().toISOString();
        persist();
        setStatus(
            CAT_LABELS[category] + ': готово — ' + result.ok + ' ok, ' + result.failed + ' ошибок',
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
    let totalOk = 0;
    let totalFailed = 0;

    for (const category of categories) {
        setProgress('Синхронизация: ' + CAT_LABELS[category] + '...');
        setStatus('▶ ' + CAT_LABELS[category] + ': старт', 'info');
        try {
            const result = await SYNC_FUNCTIONS[category]();
            totalOk += result.ok;
            totalFailed += result.failed;
            setStatus(
                CAT_LABELS[category] + ': готово — ' + result.ok + ' ok, ' + result.failed + ' ошибок',
                result.failed > 0 ? 'error' : 'ok',
            );
        } catch (err) {
            totalFailed++;
            setStatus(CAT_LABELS[category] + ': ошибка — ' + err.message, 'error');
        }
    }

    settings.lastSync = new Date().toISOString();
    persist();
    setProgress('');
    setBusy(false);
    setStatus(
        'Всё готово — ' + totalOk + ' страниц, ' + totalFailed + ' ошибок.',
        totalFailed > 0 ? 'error' : 'ok',
    );
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

    try {
        for (const category of missing) {
            const existing = await findDatabaseByTitle(DB_TITLES[category]);
            if (existing) {
                settings[DB_KEYS[category]] = existing.id;
                jQuery('#ls_db_' + category).val(existing.id);
                setStatus('= ' + DB_TITLES[category] + ': найдена готовая', 'info');
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
            jQuery('#ls_db_' + category).val(created.id);
            setStatus('+ ' + DB_TITLES[category] + ': создана', 'ok');
        }

        persist();
        setStatus('Готово: проверено категорий — ' + missing.length, 'ok');
    } catch (err) {
        setStatus('Не удалось создать базы: ' + err.message, 'error');
    } finally {
        setProgress('');
        setBusy(false);
    }
}

/* ------------------------------------------------------------------ */
/* UI wiring                                                           */
/* ------------------------------------------------------------------ */

function bindDbInput(category) {
    const selector = '#ls_db_' + category;
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
        jQuery(this).text(hidden ? 'Hide' : 'Show');
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

    jQuery('#ls_test').on('click', testConnection);
    jQuery('#ls_sync_all').on('click', syncAll);
    jQuery('#ls_create_dbs').on('click', createMissingDatabases);

    jQuery('#ls_version').text('v' + EXT_VERSION);

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

jQuery(async function () {
    try {
        const html = await getContext().renderExtensionTemplateAsync(
            'third-party/lorebook-sync',
            'settings',
        );
        jQuery('#extensions_settings2').append(html);
        bindUi();
        console.log('Lorebook Sync: ready');
    } catch (err) {
        console.error('Lorebook Sync: failed to render settings', err);
    }
});
