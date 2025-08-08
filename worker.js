// This is your bot token, stored securely as a secret in your Worker's settings.
const BOT_TOKEN = `7404291471:AAGlyiRxnkQ9KM-8aVkECbeIuFuWkJoSdxY`;
const TELEGRAM_API_URL = `https://api.telegram.org/bot${BOT_TOKEN}/`;
const TEMP_MAIL_API = 'https://www.1secmail.com/api/v1/';

// The main entry point for the worker.
addEventListener('fetch', event => {
    event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
    const url = new URL(request.url);

    // This block is for setting the webhook. You only need to run this once.
    if (url.pathname === '/set-webhook') {
        const webhookUrl = url.origin;
        const setWebhookResponse = await fetch(
            `${TELEGRAM_API_URL}setWebhook?url=${webhookUrl}`
        );
        return new Response(await setWebhookResponse.text(), {
            headers: { 'Content-Type': 'application/json' },
        });
    }

    // This is the main handler for incoming updates from Telegram.
    if (request.method === 'POST') {
        const update = await request.json();

        if (update.message) {
            await handleMessage(update.message);
        } else if (update.callback_query) {
            await handleCallbackQuery(update.callback_query);
        }

        return new Response('OK');
    }

    return new Response('Hello from your Telegram bot worker!');
}

async function handleMessage(message) {
    const chatId = message.chat.id;
    const text = message.text || '';

    if (text === '/start') {
        const existingEmail = await ACCOUNTS.get(chatId.toString());
        await sendMailMenu(chatId, existingEmail);
    }
}

async function handleCallbackQuery(callbackQuery) {
    const chatId = callbackQuery.message.chat.id;
    const data = callbackQuery.data;

    await acknowledgeCallback(callbackQuery.id);

    switch (data) {
        case 'new_email':
            await generateNewEmail(chatId);
            break;
        case 'refresh_inbox':
            await checkInbox(chatId);
            break;
        case 'delete_email':
            await deleteEmail(chatId);
            break;
    }
}

async function acknowledgeCallback(callbackQueryId) {
    await fetch(`${TELEGRAM_API_URL}answerCallbackQuery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            callback_query_id: callbackQueryId,
        }),
    });
}

async function sendMailMenu(chatId, emailAddress) {
    let messageText;
    let buttons;

    if (emailAddress) {
        messageText = `Current email address: \`${emailAddress}\`\n\nYour inbox is empty.`;
        buttons = [
            [{ text: '🔄 Refresh Inbox', callback_data: 'refresh_inbox' }],
            [{ text: '➕ Generate New / Delete', callback_data: 'delete_email' }],
            [{ text: 'Open in Browser', url: `https://www.1secmail.com/?${emailAddress}` }],
        ];
    } else {
        messageText = 'Welcome to the Temp Mail bot!\n\nNo active email address. Tap the button to get started.';
        buttons = [
            [{ text: '➕ Generate New', callback_data: 'new_email' }],
        ];
    }

    const replyMarkup = {
        inline_keyboard: buttons,
    };

    await fetch(`${TELEGRAM_API_URL}sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            chat_id: chatId,
            text: messageText,
            reply_markup: replyMarkup,
            parse_mode: 'Markdown',
        }),
    });
}

async function generateNewEmail(chatId) {
    const res = await fetch(`${TEMP_MAIL_API}?action=genRandomMailbox`);
    const [newEmail] = await res.json();
    await ACCOUNTS.put(chatId.toString(), newEmail);
    await sendMailMenu(chatId, newEmail);
}

async function deleteEmail(chatId) {
    await ACCOUNTS.delete(chatId.toString());
    await sendMailMenu(chatId, null);
}

async function checkInbox(chatId) {
    const emailAddress = await ACCOUNTS.get(chatId.toString());
    if (!emailAddress) {
        return sendMailMenu(chatId, null);
    }

    const [login, domain] = emailAddress.split('@');
    const res = await fetch(`${TEMP_MAIL_API}?action=getMessages&login=${login}&domain=${domain}`);
    const messages = await res.json();

    if (messages && messages.length > 0) {
        for (const msg of messages) {
            const messageText = `*New email message*\n\nFrom: \`${msg.from}\`\nSubject: \`${msg.subject}\``;
            await fetch(`${TELEGRAM_API_URL}sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: chatId,
                    text: messageText,
                    parse_mode: 'Markdown',
                }),
            });
        }
    } else {
        const messageText = `Current email address: \`${emailAddress}\`\n\nNo new emails.`;
        const buttons = [
            [{ text: '🔄 Refresh Inbox', callback_data: 'refresh_inbox' }],
            [{ text: '➕ Generate New / Delete', callback_data: 'delete_email' }],
            [{ text: 'Open in Browser', url: `https://www.1secmail.com/?${emailAddress}` }],
        ];
        const replyMarkup = { inline_keyboard: buttons };

        await fetch(`${TELEGRAM_API_URL}sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                text: messageText,
                reply_markup: replyMarkup,
                parse_mode: 'Markdown',
            }),
        });
    }
}
