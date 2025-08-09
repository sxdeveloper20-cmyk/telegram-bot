// Environment variables:
// BOT_TOKEN - Your Telegram bot token secret
// POINTS_STORE - The KV namespace for storing user email data

const API_BASE = "https://www.1secmail.com/api/v1/";

export default {
    async fetch(request, env) {
        if (request.method === "POST") {
            const update = await request.json();
            if (update.message) {
                return handleMessage(update.message, env);
            } else if (update.callback_query) {
                return handleCallbackQuery(update.callback_query, env);
            }
        }
        return new Response("Hello! This is the Temp Mail bot worker. It's running correctly.", { status: 200 });
    },
};

/**
 * Handles incoming Telegram messages.
 * @param {object} message - The Telegram message object.
 * @param {object} env - The environment variables.
 */
async function handleMessage(message, env) {
    const chatId = message.chat.id;
    if (!message.text) return new Response("OK"); // Ignore non-text messages

    const command = message.text.split(' ')[0]; // Get the command part

    // MODIFIED: Command router
    switch (command) {
        case "/start":
            await env.POINTS_STORE.delete(chatId.toString());
            await showDomainSelection(env.BOT_TOKEN, chatId);
            break;
        case "/myemail": // NEW: Get current email
            const currentEmail = await env.POINTS_STORE.get(chatId.toString());
            if (currentEmail) {
                await sendMessage(env.BOT_TOKEN, chatId, `Your current email address is:\n\n\`${currentEmail}\``, generateMainMenu(currentEmail));
            } else {
                await sendMessage(env.BOT_TOKEN, chatId, "You don't have an active email address. Use /start to generate one.");
            }
            break;
        case "/help": // NEW: Help command
            const helpText = `*Welcome to Temp Mail Bot!*

Here are the available commands:
- \`/start\` - Generates a new temporary email address. You can choose your preferred domain.
- \`/myemail\` - Shows your current active email address and the main menu.
- \`/help\` - Shows this help message.

*How to use the buttons:*
- \`➕ Generate New\`: Lets you pick a new domain and creates a new email, deleting the old one.
- \`🔄 Refresh\`: Checks your inbox for new emails.
- \`📧 [Email Subject]\`: Click on an email in your inbox to read its full content.
- \`📄 Download [Filename]\`: If an email has attachments, a download button will appear.`;
            await sendMessage(env.BOT_TOKEN, chatId, helpText);
            break;
        default:
            await sendMessage(env.BOT_TOKEN, chatId, "Unknown command. Send /help to see the list of available commands.");
            break;
    }
    return new Response("OK", { status: 200 });
}


/**
 * Handles button clicks from inline keyboards.
 * @param {object} callbackQuery - The Telegram callback query object.
 * @param {object} env - The environment variables.
 */
async function handleCallbackQuery(callbackQuery, env) {
    const chatId = callbackQuery.message.chat.id;
    const messageId = callbackQuery.message.message_id;
    const data = callbackQuery.data;
    const token = env.BOT_TOKEN;

    // MODIFIED: Enhanced callback router
    if (data.startsWith("generate_new:")) {
        const domain = data.split(':')[1];
        const newEmail = await generateNewEmail(domain);
        await env.POINTS_STORE.put(chatId.toString(), newEmail);
        
        const text = `Your temporary email address:\n\n\`${newEmail}\`\n\n(Tap to copy)`;
        await editMessageText(token, chatId, messageId, text, generateMainMenu(newEmail));
        await answerCallbackQuery(token, callbackQuery.id, "New email generated!");

    } else if (data === "generate_new") {
        await showDomainSelection(token, chatId, messageId);
        await answerCallbackQuery(token, callbackQuery.id, "Please choose a domain.");

    } else if (data === "refresh_inbox") {
        const emailAddress = await env.POINTS_STORE.get(chatId.toString());
        if (!emailAddress) {
            await answerCallbackQuery(token, callbackQuery.id, "Please use /start to generate an email first.", true);
            return new Response("OK");
        }

        const [login, domain] = emailAddress.split('@');
        const messages = await fetchInbox(login, domain);
        
        let text = `Current email address:\n\`${emailAddress}\`\n\n`;
        let keyboard;

        if (messages.length === 0) {
            text += "Your inbox is empty.";
            keyboard = generateMainMenu(emailAddress);
        } else {
            text += "Here are your emails:";
            const messageButtons = messages.map(msg => ([{ text: `📧 ${msg.from} | ${msg.subject}`, callback_data: `read_message:${msg.id}` }]));
            keyboard = {
                inline_keyboard: [
                    ...messageButtons,
                    [{ text: "🔄 Refresh", callback_data: "refresh_inbox" }],
                    [{ text: "🔙 Back to Main Menu", callback_data: "back_to_main" }]
                ]
            };
        }
        await editMessageText(token, chatId, messageId, text, keyboard);
        await answerCallbackQuery(token, callbackQuery.id, "Inbox refreshed!");
    
    } else if (data.startsWith("read_message:")) {
        const messageIdToRead = data.split(':')[1];
        const emailAddress = await env.POINTS_STORE.get(chatId.toString());
        if (!emailAddress) return new Response("OK");

        const [login, domain] = emailAddress.split('@');
        const messageContent = await readMessage(login, domain, messageIdToRead);
        
        if (messageContent) {
            let formattedMessage = `*From:* \`${messageContent.from}\`\n*Subject:* ${messageContent.subject}\n*Date:* ${messageContent.date}\n\n---\n${messageContent.textBody || "This email has no text content."}`;
            let attachmentKeyboard = null;

            // NEW: Handle attachments
            if (messageContent.attachments && messageContent.attachments.length > 0) {
                formattedMessage += "\n\n--- \n*Attachments:*";
                const attachmentButtons = messageContent.attachments.map(att => {
                    const downloadUrl = `${API_BASE}?action=download&login=${login}&domain=${domain}&id=${messageIdToRead}&file=${att.filename}`;
                    // Note: Telegram button URLs must be HTTPS
                    return [{ text: `📄 Download ${att.filename} (${(att.size / 1024).toFixed(2)} KB)`, url: downloadUrl }];
                });
                attachmentKeyboard = { inline_keyboard: attachmentButtons };
            }
            
            await sendMessage(token, chatId, formattedMessage, attachmentKeyboard);
            await answerCallbackQuery(token, callbackQuery.id);
        } else {
            await answerCallbackQuery(token, callbackQuery.id, "Error: Could not retrieve message.", true);
        }

    } else if (data === "back_to_main") {
        const emailAddress = await env.POINTS_STORE.get(chatId.toString());
        const text = `Your temporary email address:\n\n\`${emailAddress}\`\n\n(Tap to copy)`;
        await editMessageText(token, chatId, messageId, text, generateMainMenu(emailAddress));
        await answerCallbackQuery(token, callbackQuery.id);
    }

    return new Response("OK", { status: 200 });
}

// --- HELPER FUNCTIONS ---

// --- 1secmail API Functions ---
async function getDomains() { // NEW: Function to get available domains
    const response = await fetch(`${API_BASE}?action=getDomainList`);
    return await response.json();
}

async function generateNewEmail(domain) { // MODIFIED: To accept a domain
    // 1secmail's genRandomMailbox doesn't let us specify a domain, so we do it manually.
    const randomLogin = Math.random().toString(36).substring(2, 12);
    return `${randomLogin}@${domain}`;
}

async function fetchInbox(login, domain) {
    const response = await fetch(`${API_BASE}?action=getMessages&login=${login}&domain=${domain}`);
    return await response.json();
}

async function readMessage(login, domain, messageId) {
    const response = await fetch(`${API_BASE}?action=readMessage&login=${login}&domain=${domain}&id=${messageId}`);
    return await response.json();
}

// --- Telegram API Functions ---
async function sendMessage(token, chatId, text, replyMarkup = null) {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const payload = { chat_id: chatId, text: text, parse_mode: 'Markdown' };
    if (replyMarkup) payload.reply_markup = replyMarkup;
    await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
}

async function editMessageText(token, chatId, messageId, text, replyMarkup = null) {
    const url = `https://api.telegram.org/bot${token}/editMessageText`;
    const payload = { chat_id: chatId, message_id: messageId, text: text, parse_mode: 'Markdown' };
    if (replyMarkup) payload.reply_markup = replyMarkup;
    await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
}

async function answerCallbackQuery(token, callbackQueryId, text = "", showAlert = false) {
    const url = `https://api.telegram.org/bot${token}/answerCallbackQuery`;
    const payload = { callback_query_id: callbackQueryId, text: text, show_alert: showAlert };
    await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
}

// --- Keyboard & Menu Generation ---
function generateMainMenu(email) { // MODIFIED to be more dynamic
    return {
        inline_keyboard: [
            [{ text: "➕ Generate New", callback_data: "generate_new" }, { text: "🔄 Refresh", callback_data: "refresh_inbox" }]
        ]
    };
}

async function showDomainSelection(token, chatId, messageId = null) { // NEW: Function to show domain choices
    const domains = await getDomains();
    if (!domains || domains.length === 0) {
        await sendMessage(token, chatId, "Sorry, could not fetch available domains at the moment. Please try again later.");
        return;
    }
    const domainButtons = domains.map(domain => ([{ text: `➤ ${domain}`, callback_data: `generate_new:${domain}` }]));
    const keyboard = { inline_keyboard: domainButtons };
    const text = "Please choose a domain for your new email address:";
    
    if (messageId) {
        await editMessageText(token, chatId, messageId, text, keyboard);
    } else {
        await sendMessage(token, chatId, text, keyboard);
    }
}
