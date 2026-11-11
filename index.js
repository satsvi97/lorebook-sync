/**
 * Lorebook Sync — SillyTavern extension
 * Synchronizes world info (lorebooks) with a Notion database.
 *
 * v0.1: one-way sync ST -> Notion. Characters and personas come later.
 */

import { extension_settings, getContext } from '../../../extensions.js';
import { getRequestHeaders } from '../../../../script.js';

const MODULE_NAME = 'lorebook-sync';
const NOTION_API = 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';

// Database the author uses for testing. Users can change it in settings.
const DEFAULT_DATABASE_ID = '4154bb5f-cb35-807f-ad57-ed82105923bc';

const defaultSettings = Object.freeze({
    enabled: true,
    token: '',
    databaseId: DEFAULT_DATABASE_ID,
    includeEmpty: false,
    lastSync: '',
});

function getSettings() {
    if (!extension_settings[MODULE_NAME]) {
        extension_settings[MODULE_NAME] = structuredClone(defaultSettings);
    }
    for (const key of Object.keys(defaultSettings)) {
        if (!Object.hasOwn(extension_settings[MODULE_NAME], key)) {
            extension_settings[MODULE_NAME][key] = defaultSettings[key];
        }
    }
    return extension_settings[MODULE_NAME];
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
    const area = jQuery('#lorebook_sync_log');
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
    jQuery('#lorebook_sync_progress').text(text || '');
}

function setBusy(busy) {
    jQuery('#lorebook_sync_sync').toggleClass('disabled', busy).attr('aria-disabled', busy ? 'true' : 'false');
    jQuery('#lorebook_sync_test').toggleClass('disabled', busy).attr('aria-disabled', busy ? 'true' : 'false');
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

    const response = await fetch(NOTION_API + path, {
        method: opts.method || 'GET',
        headers,
        body: opts.body ? JSON.stringify(opts.body) : undefined,
    });

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

/**
 * Turn a world info "entries" object into Notion blocks.
 */
function entryBlocks(entries) {
    const blocks = [];
    for (const uid of Object.keys(entries)) {
        const entry = entries[uid] || {};
        const primaryKeys = [entry.key, entry.keysecondary].filter(Boolean).join(', ');
        const label = (entry.comment && String(entry.comment).trim()) || primaryKeys || ('Entry ' + uid);
        const heading = primaryKeys && entry.comment ? (label + ' — ' + primaryKeys) : label;

        blocks.push({
            object: 'block',
            type: 'heading_3',
            heading_3: { rich_text: richText(heading.slice(0, 1900)) },
        });

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

async function findPageByTitle(title) {
    const settings = getSettings();
    const data = await notionRequest('/databases/' + settings.databaseId + '/query', {
        method: 'POST',
        body: {
            filter: { property: 'Name', title: { equals: title } },
            page_size: 1,
        },
    });
    return (data.results && data.results[0]) || null;
}

/* ------------------------------------------------------------------ */
/* SillyTavern API                                                     */
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

/* ------------------------------------------------------------------ */
/* Sync logic                                                          */
/* ------------------------------------------------------------------ */

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

        if (settings.databaseId) {
            const db = await notionRequest('/databases/' + settings.databaseId);
            const title = (db.title || []).map(function (part) { return part.plain_text; }).join('');
            setStatus('База доступна: ' + (title || settings.databaseId), 'ok');
        } else {
            setStatus('Database ID не указан — синхронизация будет недоступна.', 'muted');
        }
    } catch (err) {
        setStatus('Ошибка подключения: ' + err.message, 'error');
    } finally {
        setBusy(false);
    }
}

async function syncLorebook(book) {
    const settings = getSettings();
    const data = await readLorebook(book.name);
    const entries = data.entries || {};
    const count = Object.keys(entries).length;

    if (count === 0 && !settings.includeEmpty) {
        return { name: book.name, entries: 0, skipped: true };
    }

    const blocks = entryBlocks(entries);
    let pageId;

    const existing = await findPageByTitle(book.name);
    if (existing) {
        pageId = existing.id;
        await clearPage(pageId);
    } else {
        const created = await notionRequest('/pages', {
            method: 'POST',
            body: {
                parent: { database_id: settings.databaseId },
                properties: {
                    Name: {
                        title: [{ type: 'text', text: { content: book.name } }],
                    },
                },
            },
        });
        pageId = created.id;
    }

    await appendBlocks(pageId, blocks);
    return { name: book.name, entries: count, pageId, skipped: false };
}

async function syncAll() {
    const settings = getSettings();
    if (!settings.token) {
        setStatus('Сначала укажите Notion integration token.', 'error');
        return;
    }
    if (!settings.databaseId) {
        setStatus('Сначала укажите Notion database ID.', 'error');
        return;
    }

    setBusy(true);
    jQuery('#lorebook_sync_log').empty();
    setProgress('Читаю список лорбуков...');

    try {
        const books = await listLorebooks();
        setStatus('Найдено лорбуков: ' + books.length, 'info');

        let done = 0;
        let failed = 0;

        for (const book of books) {
            try {
                const result = await syncLorebook(book);
                if (result.skipped) {
                    setStatus('— ' + book.name + ': пропущен (пустой)', 'muted');
                } else {
                    setStatus('— ' + book.name + ': ' + result.entries + ' записей', 'ok');
                }
                done++;
            } catch (err) {
                failed++;
                setStatus('— ' + book.name + ': ' + err.message, 'error');
            }
            setProgress('Обработано ' + (done + failed) + ' из ' + books.length);
        }

        settings.lastSync = new Date().toISOString();
        persist();

        setProgress('');
        setStatus(
            'Готово: ' + done + ' синхронизировано, ' + failed + ' с ошибкой.',
            failed > 0 ? 'error' : 'ok',
        );
    } catch (err) {
        setProgress('');
        setStatus('Синхронизация не удалась: ' + err.message, 'error');
    } finally {
        setBusy(false);
    }
}

/* ------------------------------------------------------------------ */
/* UI wiring                                                           */
/* ------------------------------------------------------------------ */

function bindUi() {
    const settings = getSettings();

    jQuery('#lorebook_sync_token')
        .val(settings.token)
        .on('input', function () {
            settings.token = String(jQuery(this).val()).trim();
            persist();
        });

    jQuery('#lorebook_sync_database')
        .val(settings.databaseId)
        .on('input', function () {
            settings.databaseId = String(jQuery(this).val()).trim();
            persist();
        });

    jQuery('#lorebook_sync_include_empty')
        .prop('checked', Boolean(settings.includeEmpty))
        .on('change', function () {
            settings.includeEmpty = Boolean(jQuery(this).prop('checked'));
            persist();
        });

    jQuery('#lorebook_sync_toggle_token').on('click', function () {
        const field = jQuery('#lorebook_sync_token');
        const hidden = field.attr('type') === 'password';
        field.attr('type', hidden ? 'text' : 'password');
        jQuery(this).text(hidden ? 'Hide' : 'Show');
    });

    jQuery('#lorebook_sync_test').on('click', testConnection);
    jQuery('#lorebook_sync_sync').on('click', syncAll);
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
