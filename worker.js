// This is the new ES Module export format for Cloudflare Workers.
// All code is now contained within the default export.
export default {
    async fetch(request, env) {
        // The env object contains your KV bindings and secrets.
        // We pass it to the main handler to access them.
        if (request.method === 'POST') {
            try {
                const update = await request.json();
                await handleUpdate(update, env);
                return new Response('OK', { status: 200 });
            } catch (error) {
                console.error('Error handling request:', error);
                return new Response('Internal Server Error', { status: 500 });
            }
        }
        return new Response('OK', { status: 200 });
    }
};

const BASE_URL = `https://api.telegram.org/bot`;

// IMPORTANT: Add the user IDs of your bot administrators here.
const ADMIN_IDS = ['YOUR_ADMIN_USER_ID_1', 'YOUR_ADMIN_USER_ID_2'];

// IMPORTANT: Set the username of the public channel to get random photos from.
const SOURCE_CHANNEL_USERNAME = '@YOUR_SOURCE_CHANNEL_USERNAME';

// --- Core Bot Logic Functions ---

/**
 * Handles different types of Telegram updates.
 * @param {object} update The update object from Telegram.
 * @param {object} env The environment object containing bindings and secrets.
 */
async function handleUpdate(update, env) {
    if (update.callback_query) {
        await handleCallbackQuery(update.callback_query, env);
    } else if (update.message) {
        await handleMessage(update.message, env);
    }
}

/**
 * Handles callback queries from inline buttons.
 * @param {object} callbackQuery The callback query object.
 * @param {object} env The environment object.
 */
async function handleCallbackQuery(callbackQuery, env) {
    const data = callbackQuery.data;
    const chatId = callbackQuery.message.chat.id;
    const messageId = callbackQuery.message.message_id;

    await answerCallbackQuery(callbackQuery.id, env);

    if (data === '/Commands' || data === '/start') {
        await deleteMessage(chatId, messageId, env);
        await sendCommandsMenu(chatId, env);
    } else if (data === 'Video1') {
        await sendVideo1(chatId, env);
    }
}

/**
 * Handles incoming text messages from users.
 * @param {object} message The message object.
 * @param {object} env The environment object.
 */
async function handleMessage(message, env) {
    const text = message.text;
    const chatId = message.chat.id;
    const user = message.from;
    const messageId = message.message_id;

    const startPayload = text.startsWith('/start ') ? text.split(' ')[1] : null;
    const command = text.split(' ')[0];

    if (startPayload) {
        await handleReferralCallback(chatId, user, startPayload, env);
    } else {
        switch (command) {
            case '/start':
                await sendWelcomeMessage(chatId, user, env);
                break;
            case '/Commands':
                await deleteMessage(chatId, messageId, env);
                await sendCommandsMenu(chatId, env);
                break;
            case '/about':
                await sendAboutMessage(chatId, user, env);
                break;
            case '🌺 video':
                await sendVbMenu(chatId, env);
                break;
            case '/info':
                await sendUserInfo(chatId, user, env);
                break;
            case '🌺 video1':
                await sendVideo1(chatId, env);
                break;
            case '/daily':
                await handleDailyBonus(chatId, user, env);
                break;
            case '/refer':
                await handleReferralLink(chatId, user, env);
                break;
            case '/referral':
                await handleReferralInfo(chatId, user, env);
                break;
            case '/points':
                await handlePointsCommand(chatId, user, env);
                break;
            case '/top':
                await handleTopCommand(chatId, env);
                break;
            case '/PointPrices':
                await handlePointPricesCommand(chatId, env);
                break;
            case '/photo':
                await handlePhotoCommand(chatId, env);
                break;
            case '/gen':
                if (isAdmin(user.id)) {
                    await handleGenCommand(chatId, text, env);
                } else {
                    await telegramApiRequest('sendMessage', { chat_id: chatId, text: '❌ You do not have permission to use this command.', protect_content: true }, env);
                }
                break;
            case '/sendpoints':
                if (isAdmin(user.id)) {
                    await handleSendPointsCommand(chatId, text, env);
                } else {
                    await telegramApiRequest('sendMessage', { chat_id: chatId, text: '❌ You do not have permission to use this command.', protect_content: true }, env);
                }
                break;
            case '/redeem':
                await handleRedeemCommand(chatId, user, text, env);
                break;
        }
    }
}

// --- Utility Functions ---

/**
 * Sends an API request to a specified endpoint.
 * @param {string} endpoint The Telegram API endpoint (e.g., 'sendMessage').
 * @param {object} body The JSON body of the request.
 * @param {object} env The environment object.
 */
async function telegramApiRequest(endpoint, body, env) {
    const url = `${BASE_URL}${env.TELEGRAM_TOKEN}/${endpoint}`;
    const headers = { 'Content-Type': 'application/json' };
    const options = {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(body),
    };
    try {
        const response = await fetch(url, options);
        if (!response.ok) {
            const errorText = await response.text();
            console.error(`Telegram API error for ${endpoint}:`, response.status, errorText);
        }
    } catch (error) {
        console.error(`Failed to send request to ${endpoint}:`, error);
    }
}

/**
 * Checks if a user is an admin.
 * @param {string} userId The user's ID.
 * @returns {boolean} True if the user is an admin, otherwise false.
 */
function isAdmin(userId) {
    return ADMIN_IDS.includes(userId.toString());
}

/**
 * Deletes a message.
 * @param {number} chatId The ID of the chat.
 * @param {number} messageId The ID of the message to delete.
 * @param {object} env The environment object.
 */
async function deleteMessage(chatId, messageId, env) {
    await telegramApiRequest('deleteMessage', { chat_id: chatId, message_id: messageId }, env);
}

/**
 * Answers a callback query to stop the loading animation on the button.
 * @param {string} callbackQueryId The ID of the callback query.
 * @param {object} env The environment object.
 */
async function answerCallbackQuery(callbackQueryId, env) {
    await telegramApiRequest('answerCallbackQuery', { callback_query_id: callbackQueryId }, env);
}

/**
 * Utility function to escape HTML entities in a string.
 * @param {string} str The string to escape.
 * @returns {string} The escaped string.
 */
function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}


// --- KV Store Interaction Functions ---

/**
 * Retrieves a user's points from the KV store.
 * @param {string} userId The user's ID.
 * @param {object} env The environment object.
 * @returns {number} The user's points.
 */
async function getPoints(userId, env) {
    const points = await env.POINTS_STORE.get(`user_points_${userId}`);
    return points ? parseInt(points, 10) : 0;
}

/**
 * Sets a user's points in the KV store.
 * @param {string} userId The user's ID.
 * @param {number} points The new points value.
 * @param {object} env The environment object.
 */
async function setPoints(userId, points, env) {
    await env.POINTS_STORE.put(`user_points_${userId}`, points.toString());
}

/**
 * Retrieves a user's referral count from the KV store.
 * @param {string} userId The user's ID.
 * @param {object} env The environment object.
 * @returns {number} The user's referral count.
 */
async function getReferralCount(userId, env) {
    const count = await env.POINTS_STORE.get(`user_referrals_${userId}`);
    return count ? parseInt(count, 10) : 0;
}

/**
 * Sets a user's referral count in the KV store.
 * @param {string} userId The user's ID.
 * @param {number} count The new count value.
 * @param {object} env The environment object.
 */
async function setReferralCount(userId, count, env) {
    await env.POINTS_STORE.put(`user_referrals_${userId}`, count.toString());
}

/**
 * Retrieves a user's referral points from the KV store.
 * @param {string} userId The user's ID.
 * @param {object} env The environment object.
 * @returns {number} The user's referral points.
 */
async function getReferralPoints(userId, env) {
    const points = await env.POINTS_STORE.get(`referral_points_${userId}`);
    return points ? parseInt(points, 10) : 0;
}

/**
 * Sets a user's referral points in the KV store.
 * @param {string} userId The user's ID.
 * @param {number} points The new points value.
 * @param {object} env The environment object.
 */
async function setReferralPoints(userId, points, env) {
    await env.POINTS_STORE.put(`referral_points_${userId}`, points.toString());
}

// --- Command Handlers ---

async function sendWelcomeMessage(chatId, user, env) {
    const videoUrl = "https://t.me/kajal_developer/57";
    const buttons = [
        [{ text: "Commands", callback_data: "/Commands" }],
        [{ text: "DEV", url: "https://t.me/pornhub_Developer" }]
    ];
    
    const userPoints = await getPoints(user.id.toString(), env);

    const caption = `<b>👋 Welcome Back ${escapeHtml(user.first_name)}</b>\n\n`
                  + `<b>🪙 Start with 0 FREE Points!</b>\n`
                  + `<b>🔹 Earn more via /refer</b>\n`
                  + `<b>🔹 Daily bonuses with /daily</b>\n\n`
                  + `<b>🚨 STRICTLY 18+ ONLY</b>\n`
                  + `<b>By continuing, you confirm you're 18+ and agree to our /privacy 🔏</b>\n\n`
                  + `<b>📌 Pro Tip: Check /help for all commands!</b>\n`
                  + `<b>🎯 Your current points: ${userPoints}</b>\n\n`
                  + `🌥️ Bot Status: Alive 🟢\n\n💞 Dev: @pornhub_Developer`;

    await telegramApiRequest('sendVideo', {
        chat_id: chatId, video: videoUrl, caption: caption, parse_mode: 'HTML',
        reply_markup: { inline_keyboard: buttons }, protect_content: true
    }, env);
}

async function sendCommandsMenu(chatId, env) {
    const videoUrl = "https://t.me/kajal_developer/57";
    const buttons = [
        [
            { text: "video 🌏", callback_data: "Video1" },
            { text: "Tools", callback_data: "/tools" }
        ],
        [
            { text: "Channel", url: "https://t.me/pornhub_Developer" },
            { text: "DEV", url: "https://t.me/pornhub_Developer" }
        ],
        [
            { text: "◀️ Go Back", callback_data: "/start" }
        ]
    ];
    const caption = `<b>[𖤐] XS :</b>\n\n<b>[ϟ] video Tools :</b>\n\n<b>[ᛟ] video - 0</b>\n<b>[ᛟ] video - 0</b>\n<b>[ᛟ] Tools - 2</b>`;

    await telegramApiRequest('sendVideo', {
        chat_id: chatId, video: videoUrl, caption: caption, parse_mode: 'HTML',
        reply_markup: { inline_keyboard: buttons }, protect_content: true
    }, env);
}

async function sendAboutMessage(chatId, user, env) {
    const aboutMessage = `
<b><blockquote>⍟───[ MY ᴅᴇᴛᴀɪʟꜱ ]───⍟</blockquote>

‣ ᴍʏ ɴᴀᴍᴇ : <a href="https://t.me/${escapeHtml(user.username)}">${escapeHtml(user.first_name)}</a>
‣ ᴍʏ ʙᴇsᴛ ғʀɪᴇɴᴅ : <a href='tg://settings'>ᴛʜɪs ᴘᴇʀsᴏɴ</a>
‣ ᴅᴇᴠᴇʟᴏᴘᴇʀ : <a href='https://t.me/sumit_developer'>💫 Sx</a>
‣ ʟɪʙʀᴀʀʏ : <a href='https://cloudflare.com'>Cloudflare</a>
‣ ʟᴀɴɢᴜᴀɢᴇ : <a href='https://www.javascript.com/'>JS 💻</a>
‣ ᴅᴀᴛᴀ ʙᴀsᴇ : <a href='https://cloudflare.com'>Cloudflare</a>
‣ ʙᴏᴛ sᴇʀᴠᴇʀ : <a href='https://cloudflare.com'>ᴄʟᴏᴜᴅғʟᴀʀᴇ ⚡</a>
‣ ʙᴜɪʟᴅ sᴛᴀᴛᴜs : v1.0 [sᴛᴀʙʟᴇ]</b>
    `;
    await telegramApiRequest('sendMessage', { chat_id: chatId, text: aboutMessage, parse_mode: 'HTML', protect_content: true, disable_web_page_preview: true }, env);
}

async function sendVbMenu(chatId, env) {
    const keyboard = {
        keyboard: [
            ["🌺 CP", "🇮🇳 Desi"],
            ["🇬🇧 Forener", "🐕‍🦺 Animal"],
            ["💕 Webseries", "💑 Gay Cp"],
            ["💸 𝘽𝙐𝙔 𝙑𝙄𝙋 💸"]
        ], resize_keyboard: true, one_time_keyboard: false
    };
    await telegramApiRequest('sendMessage', { chat_id: chatId, text: "🤗 Welcome to Lx Bot 🌺", reply_markup: keyboard, protect_content: true }, env);
}

async function sendUserInfo(chatId, user, env) {
    const fullName = `${user.first_name || ''} ${user.last_name || ''}`.trim();
    const username = user.username ? `@${user.username}` : 'None';
    const userLink = user.username ? `https://t.me/${user.username}` : '#';
    const phoneNumber = user.phone_number ? user.phone_number : 'N/A';
    const mentionLink = user.username ? `https://t.me/${user.username}` : `tg://user?id=${user.id}`;
    
    const infoMessage = `
<code>○➲ ɪᴅ: ${user.id}
➲ ᴅᴄ_ɪᴅ: N/A
➲ ꜰɪʀꜱᴛ ɴᴀᴍᴇ: ${escapeHtml(user.first_name || 'None')}
➲ ʟᴀꜱᴛ ɴᴀᴍᴇ: ${escapeHtml(user.last_name || 'None')}
➲ ꜰᴜʟʟ ɴᴀᴍᴇ: ${escapeHtml(fullName)}
➲ ᴜꜱᴇʀɴᴀᴍᴇ: ${username}
➲ ɪꜱ_ᴠᴇʀɪꜰɪᴇᴅ: ${user.is_verified ? 'Yes' : 'No'}
➲ ɪꜱ_ʀᴇꜱᴛʀɪᴄᴛᴇᴅ: ${user.is_restricted ? 'Yes' : 'No'}
➲ ɪꜱ_ꜱᴄᴀᴍ: ${user.is_scam ? 'Yes' : 'No'}
➲ ɪꜱ_ꜰᴀᴋᴇ: ${user.is_fake ? 'Yes' : 'No'}
➲ ɪꜱ_ᴩʀᴇᴍɪᴜᴍ: ${user.is_premium ? 'Yes' : 'No'}
➲ ᴍᴇɴᴛɪᴏɴ: <a href="${mentionLink}">${escapeHtml(user.first_name)}</a>
➲ ʟɪɴᴋ : <a href="${userLink}">${userLink}</a>
➲ ᴩʜᴏɴᴇ ɴᴏ: ${phoneNumber}</code>
    `;
    const buttons = [[{ text: "Copy User ID", url: `tg://user?id=${user.id}` }]];
    await telegramApiRequest('sendMessage', { chat_id: chatId, text: infoMessage, parse_mode: 'HTML', disable_web_page_preview: true, protect_content: true, reply_markup: { inline_keyboard: buttons } }, env);
}

async function sendVideo1(chatId, env) {
    const videoUrls = ["https://t.me/igftcd/7", "https://t.me/igftcd/8", "https://t.me/igftcd/9", "https://t.me/igftcd/10", "https://t.me/igftcd/12"];
    const channelName = "pornhub_Developer";
    const buttons = [[{ text: "Join " + channelName, url: "https://t.me/" + channelName }]];
    for (const videoUrl of videoUrls) {
        await telegramApiRequest('sendVideo', { chat_id: chatId, video: videoUrl, reply_markup: { inline_keyboard: buttons }, protect_content: true }, env);
    }
}

async function handleDailyBonus(chatId, user, env) {
    const userId = user.id.toString();
    const bonus = 10;
    const currentPoints = await getPoints(userId, env);
    const newPoints = currentPoints + bonus;
    await setPoints(userId, newPoints, env);
    const message = `<b>🎉 Daily bonus claimed!</b>\n` + `You received ${bonus} points.\n` + `Your new balance is ${newPoints} points.`;
    await telegramApiRequest('sendMessage', { chat_id: chatId, text: message, parse_mode: 'HTML', protect_content: true }, env);
}

async function handleReferralLink(chatId, user, env) {
    const uniqueReferralId = user.id.toString();
    const referralLink = `https://t.me/YOUR_BOT_USERNAME?start=${uniqueReferralId}`;
    const message = `
<b>📢 𝗦𝗵𝗮𝗿𝗲 𝘁𝗵𝗶𝘀 𝗹𝗶𝗻𝗸 𝘁𝗼 𝗿𝗲𝗳𝗲𝗿 𝘆𝗼𝘂𝗿 𝗳𝗿𝗶𝗲𝗻𝗱𝘀 𝗮𝗻𝗱 𝗲𝗮𝗿𝗻 𝗽𝗼𝗶𝗻𝘁𝘀! 🤗</b>
    
1 𝘴𝘶𝘤𝘤𝘦𝘴𝘴𝘧𝘶𝘭 𝘳𝘦𝘧𝘦𝘳𝘳𝘢𝘭 = 10 𝘗𝘰𝘪𝘯𝘵𝘴! 🏅
`;
    const buttons = [[{ text: "✨ Share Link", url: `https://t.me/share/url?url=${encodeURIComponent(referralLink)}&text=${encodeURIComponent('Hey, check out this bot! I got a bonus by joining. You can too!')}` }]];
    await telegramApiRequest('sendMessage', { chat_id: chatId, text: message, parse_mode: 'HTML', reply_markup: { inline_keyboard: buttons }, disable_web_page_preview: true, protect_content: true }, env);
}

async function handleReferralInfo(chatId, user, env) {
    const userId = user.id.toString();
    const referralCount = await getReferralCount(userId, env);
    const referralPoints = await getReferralPoints(userId, env);
    const message = `<b>👥 Total Referrals: ${referralCount}</b>\n` + `<b>🏅 Points Earned: ${referralPoints}</b>`;
    await telegramApiRequest('sendMessage', { chat_id: chatId, text: message, parse_mode: 'HTML', protect_content: true }, env);
}

async function handlePointsCommand(chatId, user, env) {
    const userPoints = await getPoints(user.id.toString(), env);
    const message = `<b>🏅 Your current points balance:</b>\n\n` + `You have <b>${userPoints}</b> points.`;
    await telegramApiRequest('sendMessage', { chat_id: chatId, text: message, parse_mode: 'HTML', protect_content: true }, env);
}

async function handleTopCommand(chatId, env) {
    const listResponse = await env.POINTS_STORE.list({ prefix: 'user_referrals_' });
    const userPromises = listResponse.keys.map(async key => {
        const userId = key.name.split('_')[2];
        const referrals = await getReferralCount(userId, env);
        const points = await getReferralPoints(userId, env);
        return { userId, referrals, points };
    });
    const allUsers = await Promise.all(userPromises);
    const topUsers = allUsers.sort((a, b) => b.referrals - a.referrals).slice(0, 10);
    let message = `<b>🏆 Top 10 Users by Referrals 🏆</b>\n\n`;
    topUsers.forEach((user, index) => {
        const rank = index + 1;
        const emoji = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : '🏅';
        message += `${emoji} <b>${rank}.</b> <a href="tg://user?id=${user.userId}">User ${user.userId}</a>\n`;
        message += `🏅 Referrals: ${user.referrals} | 💰 Points: ${user.points}\n`;
        message += '━━━━━━━━━━━━━━\n';
    });
    if (topUsers.length === 0) {
        message += 'No referrals found yet.';
    }
    await telegramApiRequest('sendMessage', { chat_id: chatId, text: message, parse_mode: 'HTML', disable_web_page_preview: true, protect_content: true }, env);
}

async function handlePointPricesCommand(chatId, env) {
    const message = `
<b>💰 𝗣𝘂𝗿𝗰𝗵𝗮𝘀𝗲 𝗣𝗼𝗶𝗻𝘁𝘀 𝗡𝗼𝘄! 💰</b>

🪙 ₹20 = 30 Points ⭐️
🪙 ₹30 = 60 Points ⭐️
🪙 ₹50 = 120 + 50 Bonus Points ⭐️
🪙 ₹100 = 280 + 100 Bonus Points ⭐️
🪙 ₹200 = 600 + 200 Bonus Points ⭐️
🪙 ₹300 = 1000 + 300 Bonus Points ⭐️
🪙 ₹500 = 2000 + 500 Bonus Points ⭐️

<b>Use the button below 👇 to contact the owner for purchase!</b>
    `;
    const ownerContactUrl = 'https://t.me/YOUR_OWNER_USERNAME';
    const buttons = [[{ text: "Dm to Buy 👈", url: ownerContactUrl }]];
    await telegramApiRequest('sendMessage', { chat_id: chatId, text: message, parse_mode: 'HTML', reply_markup: { inline_keyboard: buttons }, disable_web_page_preview: true, protect_content: true }, env);
}

async function handlePhotoCommand(chatId, env) {
    try {
        const photosResponse = await fetch(`${BASE_URL}${env.TELEGRAM_TOKEN}/getChatPhotos`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: SOURCE_CHANNEL_USERNAME })
        });
        const photosData = await photosResponse.json();

        if (photosData.ok && photosData.result.photos.length > 0) {
            const photos = photosData.result.photos;
            const randomPhoto = photos[Math.floor(Math.random() * photos.length)];
            const fileId = randomPhoto[0].file_id;
            await telegramApiRequest('sendPhoto', { chat_id: chatId, photo: fileId, protect_content: true }, env);
        } else {
            await telegramApiRequest('sendMessage', { chat_id: chatId, text: '❌ I could not find any photos in the specified channel.', protect_content: true }, env);
        }
    } catch (error) {
        console.error('Error handling /photo command:', error);
        await telegramApiRequest('sendMessage', { chat_id: chatId, text: '❌ An error occurred while trying to get a photo.', protect_content: true }, env);
    }
}

async function handleGenCommand(chatId, text, env) {
    const parts = text.split(' ');
    if (parts.length !== 3) {
        await telegramApiRequest('sendMessage', { chat_id: chatId, text: '❌ Invalid format. Usage: `/gen <value> <validity>`\nExample: `/gen 50 24h` or `/gen 100 7d`', parse_mode: 'Markdown', protect_content: true }, env);
        return;
    }
    const value = parseInt(parts[1], 10);
    const validityStr = parts[2].toLowerCase();
    if (isNaN(value) || value <= 0) {
        await telegramApiRequest('sendMessage', { chat_id: chatId, text: '❌ Points value must be a positive number.', protect_content: true }, env);
        return;
    }
    let validityInSeconds;
    if (validityStr.endsWith('h')) {
        const hours = parseInt(validityStr.slice(0, -1), 10);
        validityInSeconds = hours * 60 * 60;
    } else if (validityStr.endsWith('d')) {
        const days = parseInt(validityStr.slice(0, -1), 10);
        validityInSeconds = days * 24 * 60 * 60;
    } else {
        await telegramApiRequest('sendMessage', { chat_id: chatId, text: '❌ Invalid validity format. Use "h" for hours or "d" for days (e.g., 24h, 7d).', protect_content: true }, env);
        return;
    }
    const redeemCode = `C0de-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    const expirationDate = new Date(Date.now() + validityInSeconds * 1000);
    const codeData = { value: value, expiry: expirationDate.toISOString(), redeemedBy: [] };
    await env.POINTS_STORE.put(`redeem_code_${redeemCode}`, JSON.stringify(codeData));
    const message = `
<b>🎉 𝗡𝗲𝘄 𝗥𝗲𝗱𝗲𝗲𝗺 𝗖𝗼𝗱𝗲𝘀 𝗔𝘃𝗮𝗶𝗹𝗮𝗯𝗹𝗲!</b>

✧ 𝘈𝘮𝘰𝘶𝘯𝘵: <b>${redeemCode}</b>
✧ 𝘝𝘢𝘭𝘶𝘦: <b>${value} Points</b>
✧ 𝘝𝘢𝘭𝘪𝘥𝘪𝘵𝘺: <b>${validityStr}</b>

<i>How to redeem:</i>
Use <code>/redeem ${redeemCode}</code>
    `;
    await telegramApiRequest('sendMessage', { chat_id: chatId, text: message, parse_mode: 'HTML', protect_content: true }, env);
}

async function handleRedeemCommand(chatId, user, text, env) {
    const parts = text.split(' ');
    if (parts.length !== 2) {
        await telegramApiRequest('sendMessage', { chat_id: chatId, text: '❌ Invalid format. Use `/redeem CODE`', parse_mode: 'Markdown', protect_content: true }, env);
        return;
    }
    const redeemCode = parts[1].toUpperCase();
    const userId = user.id.toString();
    try {
        const codeDataStr = await env.POINTS_STORE.get(`redeem_code_${redeemCode}`);
        if (!codeDataStr) {
            await telegramApiRequest('sendMessage', { chat_id: chatId, text: '❌ This redeem code does not exist.', protect_content: true }, env);
            return;
        }
        const codeData = JSON.parse(codeDataStr);
        const now = new Date();
        if (now > new Date(codeData.expiry)) {
            await telegramApiRequest('sendMessage', { chat_id: chatId, text: '❌ This code has expired.', protect_content: true }, env);
            return;
        }
        if (codeData.redeemedBy.includes(userId)) {
            const redeemedDate = new Date(codeData.redeemedAt[userId]).toLocaleString();
            await telegramApiRequest('sendMessage', { chat_id: chatId, text: `❌ This code was already redeemed by you on ${redeemedDate}.`, protect_content: true }, env);
            return;
        }
        const currentPoints = await getPoints(userId, env);
        const newPoints = currentPoints + codeData.value;
        await setPoints(userId, newPoints, env);
        codeData.redeemedBy.push(userId);
        if (!codeData.redeemedAt) codeData.redeemedAt = {};
        codeData.redeemedAt[userId] = now.toISOString();
        await env.POINTS_STORE.put(`redeem_code_${redeemCode}`, JSON.stringify(codeData));
        const successMessage = `✅ Successfully redeemed ${codeData.value} Points!\n` + `💰 Your new balance: <b>${newPoints}</b>`;
        await telegramApiRequest('sendMessage', { chat_id: chatId, text: successMessage, parse_mode: 'HTML', protect_content: true }, env);
    } catch (error) {
        console.error('Error redeeming code:', error);
        await telegramApiRequest('sendMessage', { chat_id: chatId, text: '❌ An error occurred while redeeming the code.', protect_content: true }, env);
    }
}

async function handleSendPointsCommand(chatId, text, env) {
    const parts = text.split(' ');
    if (parts.length !== 3) {
        await telegramApiRequest('sendMessage', { chat_id: chatId, text: '❌ Invalid format. Usage: `/sendpoints <recipient_user_id> <points>`', parse_mode: 'Markdown', protect_content: true }, env);
        return;
    }
    const recipientUserId = parts[1];
    const pointsToSend = parseInt(parts[2], 10);
    if (isNaN(pointsToSend) || pointsToSend <= 0) {
        await telegramApiRequest('sendMessage', { chat_id: chatId, text: '❌ Points must be a positive number.', protect_content: true }, env);
        return;
    }
    try {
        const currentPoints = await getPoints(recipientUserId, env);
        const newPoints = currentPoints + pointsToSend;
        await setPoints(recipientUserId, newPoints, env);
        const adminMessage = `✅ Sent ${pointsToSend} points to user ${recipientUserId}. Their new balance is ${newPoints}.`;
        await telegramApiRequest('sendMessage', { chat_id: chatId, text: adminMessage, protect_content: true }, env);
        const recipientMessage = `<b>🎁 You have received a gift!</b>\n` + `You received <b>${pointsToSend}</b> points from an administrator.\n` + `Your new balance is <b>${newPoints}</b> points.`;
        await telegramApiRequest('sendMessage', { chat_id: recipientUserId, text: recipientMessage, parse_mode: 'HTML', protect_content: true }, env);
    } catch (error) {
        console.error('Error sending points:', error);
        await telegramApiRequest('sendMessage', { chat_id: chatId, text: `❌ An error occurred while sending points. Please check the user ID.`, protect_content: true }, env);
    }
}

async function handleReferralCallback(chatId, user, referrerId, env) {
    const newUserId = user.id.toString();
    const hasBeenReferred = await env.POINTS_STORE.get(`referred_${newUserId}`);
    if (!hasBeenReferred && referrerId !== newUserId) {
        const newBonus = 10;
        const newPoints = await getPoints(newUserId, env) + newBonus;
        await setPoints(newUserId, newPoints, env);
        const referrerBonus = 10;
        const referrerPoints = await getPoints(referrerId, env) + referrerBonus;
        await setPoints(referrerId, referrerPoints, env);
        const currentReferrals = await getReferralCount(referrerId, env);
        await setReferralCount(referrerId, currentReferrals + 1, env);
        const currentReferralPoints = await getReferralPoints(referrerId, env);
        await setReferralPoints(referrerId, currentReferralPoints + referrerBonus, env);
        await env.POINTS_STORE.put(`referred_${newUserId}`, 'true');
        await telegramApiRequest('sendMessage', { chat_id: chatId, text: `<b>🎉 Welcome! You received ${newBonus} points for joining via a referral link!</b>`, parse_mode: 'HTML', protect_content: true }, env);
        await telegramApiRequest('sendMessage', { chat_id: referrerId, text: `<b>🎊 Congratulations! Your referral, ${escapeHtml(user.first_name)}, just earned you ${referrerBonus} points!</b>`, parse_mode: 'HTML', protect_content: true }, env);
    }
    await sendWelcomeMessage(chatId, user, env);
}
