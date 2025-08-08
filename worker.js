// WARNING: DO NOT hardcode your token here. Use Cloudflare Workers environment variables (secrets).
const TELEGRAM_TOKEN = '7404291471:AAGlyiRxnkQ9KM-8aVkECbeIuFuWkJoSdxY';
const BASE_URL = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;

// IMPORTANT: You must bind a KV Namespace in your worker settings.
// e.g., variable name "POINTS_STORE" bound to a KV namespace.
// const POINTS_STORE = null; // This is a placeholder for the KV binding.

// IMPORTANT: Add the user IDs of your bot administrators here.
// These are the only users who can use admin-only commands.
const ADMIN_IDS = ['YOUR_ADMIN_USER_ID_1', 'YOUR_ADMIN_USER_ID_2'];

// IMPORTANT: Set the username of the public channel to get random photos from.
const SOURCE_CHANNEL_USERNAME = '@YOUR_SOURCE_CHANNEL_USERNAME';

/**
 * Main entry point for the Cloudflare Worker.
 * Handles incoming HTTP requests.
 * @param {Request} request The incoming request object.
 * @returns {Response} A response object.
 */
async function handleRequest(request) {
    if (request.method === 'POST') {
        try {
            const update = await request.json();
            await handleUpdate(update);
            return new Response('OK', { status: 200 });
        } catch (error) {
            console.error('Error handling request:', error);
            return new Response('Internal Server Error', { status: 500 });
        }
    }
    return new Response('OK', { status: 200 });
}

/**
 * Handles different types of Telegram updates.
 * @param {object} update The update object from Telegram.
 */
async function handleUpdate(update) {
    if (update.callback_query) {
        await handleCallbackQuery(update.callback_query);
    } else if (update.message) {
        await handleMessage(update.message);
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
 * Handles callback queries from inline buttons.
 * @param {object} callbackQuery The callback query object.
 */
async function handleCallbackQuery(callbackQuery) {
    const data = callbackQuery.data;
    const chatId = callbackQuery.message.chat.id;
    const messageId = callbackQuery.message.message_id;

    await answerCallbackQuery(callbackQuery.id);

    if (data === '/Commands' || data === '/start') {
        await deleteMessage(chatId, messageId);
        await sendCommandsMenu(chatId);
    } else if (data === 'Video1') {
        await sendVideo1(chatId);
    }
}

/**
 * Handles incoming text messages from users.
 * @param {object} message The message object.
 */
async function handleMessage(message) {
    const text = message.text;
    const chatId = message.chat.id;
    const user = message.from;
    const messageId = message.message_id;

    const startPayload = text.startsWith('/start ') ? text.split(' ')[1] : null;
    const command = text.split(' ')[0];

    if (startPayload) {
        await handleReferralCallback(chatId, user, startPayload);
    } else if (text === '/start') {
        await sendWelcomeMessage(chatId, user);
    } else if (text === '/Commands') {
        await deleteMessage(chatId, messageId);
        await sendCommandsMenu(chatId);
    } else if (text === '/about') {
        await sendAboutMessage(chatId, user);
    } else if (text === '🌺 video') {
        await sendVbMenu(chatId);
    } else if (text === '/info') {
        await sendUserInfo(chatId, user);
    } else if (text === '🌺 video1') {
        await sendVideo1(chatId);
    } else if (text === '/daily') {
        await handleDailyBonus(chatId, user);
    } else if (text === '/refer') {
        await handleReferralLink(chatId, user);
    } else if (text === '/referral') {
        await handleReferralInfo(chatId, user);
    } else if (text === '/points') {
        await handlePointsCommand(chatId, user);
    } else if (text === '/top') {
        await handleTopCommand(chatId);
    } else if (text === '/PointPrices') {
        await handlePointPricesCommand(chatId);
    } else if (text === '/photo') {
        await handlePhotoCommand(chatId);
    } else if (command === '/gen') {
        if (isAdmin(user.id)) {
            await handleGenCommand(chatId, text);
        } else {
            await telegramApiRequest('sendMessage', {
                chat_id: chatId,
                text: '❌ You do not have permission to use this command.',
                protect_content: true
            });
        }
    } else if (command === '/sendpoints') {
        if (isAdmin(user.id)) {
            await handleSendPointsCommand(chatId, text);
        } else {
            await telegramApiRequest('sendMessage', {
                chat_id: chatId,
                text: '❌ You do not have permission to use this command.',
                protect_content: true
            });
        }
    } else if (command === '/redeem') {
        await handleRedeemCommand(chatId, user, text);
    }
}

/**
 * Handles the command to send a random photo from a channel.
 * @param {number} chatId The ID of the chat.
 */
async function handlePhotoCommand(chatId) {
    try {
        // Fetch a list of photos from the specified channel
        const photosResponse = await fetch(`${BASE_URL}/getChatPhotos`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: SOURCE_CHANNEL_USERNAME
            })
        });
        const photosData = await photosResponse.json();

        if (photosData.ok && photosData.result.photos.length > 0) {
            const photos = photosData.result.photos;
            const randomPhoto = photos[Math.floor(Math.random() * photos.length)];
            const fileId = randomPhoto[0].file_id; // Get the smallest size photo

            await telegramApiRequest('sendPhoto', {
                chat_id: chatId,
                photo: fileId,
                protect_content: true
            });
        } else {
            await telegramApiRequest('sendMessage', {
                chat_id: chatId,
                text: '❌ I could not find any photos in the specified channel.',
                protect_content: true
            });
        }
    } catch (error) {
        console.error('Error handling /photo command:', error);
        await telegramApiRequest('sendMessage', {
            chat_id: chatId,
            text: '❌ An error occurred while trying to get a photo.',
            protect_content: true
        });
    }
}

/**
 * Handles the command to show point prices.
 * @param {number} chatId The ID of the chat.
 */
async function handlePointPricesCommand(chatId) {
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

    // Replace YOUR_OWNER_USERNAME with the actual Telegram username of the bot owner.
    const ownerContactUrl = 'https://t.me/YOUR_OWNER_USERNAME';

    const buttons = [
        [{ text: "Dm to Buy 👈", url: ownerContactUrl }]
    ];

    await telegramApiRequest('sendMessage', {
        chat_id: chatId,
        text: message,
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: buttons },
        disable_web_page_preview: true,
        protect_content: true
    });
}

/**
 * Handles the admin command to generate a new redeem code.
 * @param {number} chatId The ID of the chat.
 * @param {string} text The full command text.
 */
async function handleGenCommand(chatId, text) {
    const parts = text.split(' ');
    if (parts.length !== 3) {
        await telegramApiRequest('sendMessage', {
            chat_id: chatId,
            text: '❌ Invalid format. Usage: `/gen <value> <validity>`\nExample: `/gen 50 24h` or `/gen 100 7d`',
            parse_mode: 'Markdown',
            protect_content: true
        });
        return;
    }

    const value = parseInt(parts[1], 10);
    const validityStr = parts[2].toLowerCase();

    if (isNaN(value) || value <= 0) {
        await telegramApiRequest('sendMessage', {
            chat_id: chatId,
            text: '❌ Points value must be a positive number.',
            protect_content: true
        });
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
        await telegramApiRequest('sendMessage', {
            chat_id: chatId,
            text: '❌ Invalid validity format. Use "h" for hours or "d" for days (e.g., 24h, 7d).',
            protect_content: true
        });
        return;
    }

    const redeemCode = `C0de-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    const expirationDate = new Date(Date.now() + validityInSeconds * 1000);

    const codeData = {
        value: value,
        expiry: expirationDate.toISOString(),
        redeemedBy: []
    };

    await POINTS_STORE.put(`redeem_code_${redeemCode}`, JSON.stringify(codeData));

    const message = `
<b>🎉 𝗡𝗲𝘄 𝗥𝗲𝗱𝗲𝗲𝗺 𝗖𝗼𝗱𝗲𝘀 𝗔𝘃𝗮𝗶𝗹𝗮𝗯𝗹𝗲!</b>

✧ 𝘈𝘮𝘰𝘶𝘯𝘵: <b>${redeemCode}</b>
✧ 𝘝𝘢𝘭𝘶𝘦: <b>${value} Points</b>
✧ 𝘝𝘢𝘭𝘪𝘥𝘪𝘵𝘺: <b>${validityStr}</b>

<i>How to redeem:</i>
Use <code>/redeem ${redeemCode}</code>
    `;
    
    await telegramApiRequest('sendMessage', {
        chat_id: chatId,
        text: message,
        parse_mode: 'HTML',
        protect_content: true
    });
}

/**
 * Handles the user command to redeem a code.
 * @param {number} chatId The ID of the chat.
 * @param {object} user The user object.
 * @param {string} text The full command text.
 */
async function handleRedeemCommand(chatId, user, text) {
    const parts = text.split(' ');
    if (parts.length !== 2) {
        await telegramApiRequest('sendMessage', {
            chat_id: chatId,
            text: '❌ Invalid format. Use `/redeem CODE`',
            parse_mode: 'Markdown',
            protect_content: true
        });
        return;
    }

    const redeemCode = parts[1].toUpperCase();
    const userId = user.id.toString();

    try {
        const codeDataStr = await POINTS_STORE.get(`redeem_code_${redeemCode}`);
        if (!codeDataStr) {
            await telegramApiRequest('sendMessage', {
                chat_id: chatId,
                text: '❌ This redeem code does not exist.',
                protect_content: true
            });
            return;
        }

        const codeData = JSON.parse(codeDataStr);
        const now = new Date();
        if (now > new Date(codeData.expiry)) {
            await telegramApiRequest('sendMessage', {
                chat_id: chatId,
                text: '❌ This code has expired.',
                protect_content: true
            });
            return;
        }

        if (codeData.redeemedBy.includes(userId)) {
            const redeemedDate = new Date(codeData.redeemedAt[userId]).toLocaleString();
            await telegramApiRequest('sendMessage', {
                chat_id: chatId,
                text: `❌ This code was already redeemed by you on ${redeemedDate}.`,
                protect_content: true
            });
            return;
        }

        const currentPoints = await getPoints(userId);
        const newPoints = currentPoints + codeData.value;
        await setPoints(userId, newPoints);

        // Update the redeemedBy list
        codeData.redeemedBy.push(userId);
        if (!codeData.redeemedAt) codeData.redeemedAt = {};
        codeData.redeemedAt[userId] = now.toISOString();

        await POINTS_STORE.put(`redeem_code_${redeemCode}`, JSON.stringify(codeData));

        const successMessage = `✅ Successfully redeemed ${codeData.value} Points!\n`
                             + `💰 Your new balance: <b>${newPoints}</b>`;
        
        await telegramApiRequest('sendMessage', {
            chat_id: chatId,
            text: successMessage,
            parse_mode: 'HTML',
            protect_content: true
        });

    } catch (error) {
        console.error('Error redeeming code:', error);
        await telegramApiRequest('sendMessage', {
            chat_id: chatId,
            text: '❌ An error occurred while redeeming the code.',
            protect_content: true
        });
    }
}

/**
 * Handles the admin command to send points to another user.
 * @param {number} chatId The ID of the chat.
 * @param {string} text The full command text.
 */
async function handleSendPointsCommand(chatId, text) {
    const parts = text.split(' ');
    if (parts.length !== 3) {
        await telegramApiRequest('sendMessage', {
            chat_id: chatId,
            text: '❌ Invalid format. Usage: `/sendpoints <recipient_user_id> <points>`',
            parse_mode: 'Markdown',
            protect_content: true
        });
        return;
    }

    const recipientUserId = parts[1];
    const pointsToSend = parseInt(parts[2], 10);

    if (isNaN(pointsToSend) || pointsToSend <= 0) {
        await telegramApiRequest('sendMessage', {
            chat_id: chatId,
            text: '❌ Points must be a positive number.',
            protect_content: true
        });
        return;
    }

    try {
        const currentPoints = await getPoints(recipientUserId);
        const newPoints = currentPoints + pointsToSend;
        await setPoints(recipientUserId, newPoints);

        const adminMessage = `✅ Sent ${pointsToSend} points to user ${recipientUserId}. Their new balance is ${newPoints}.`;
        await telegramApiRequest('sendMessage', {
            chat_id: chatId,
            text: adminMessage,
            protect_content: true
        });

        const recipientMessage = `<b>🎁 You have received a gift!</b>\n`
                              + `You received <b>${pointsToSend}</b> points from an administrator.\n`
                              + `Your new balance is <b>${newPoints}</b> points.`;
        await telegramApiRequest('sendMessage', {
            chat_id: recipientUserId,
            text: recipientMessage,
            parse_mode: 'HTML',
            protect_content: true
        });

    } catch (error) {
        console.error('Error sending points:', error);
        await telegramApiRequest('sendMessage', {
            chat_id: chatId,
            text: `❌ An error occurred while sending points. Please check the user ID.`,
            protect_content: true
        });
    }
}

/**
 * Retrieves a user's points from the KV store.
 * @param {string} userId The user's ID.
 * @returns {number} The user's points.
 */
async function getPoints(userId) {
    const points = await POINTS_STORE.get(`user_points_${userId}`);
    return points ? parseInt(points, 10) : 0;
}

/**
 * Sets a user's points in the KV store.
 * @param {string} userId The user's ID.
 * @param {number} points The new points value.
 */
async function setPoints(userId, points) {
    await POINTS_STORE.put(`user_points_${userId}`, points.toString());
}

/**
 * Retrieves a user's referral count from the KV store.
 * @param {string} userId The user's ID.
 * @returns {number} The user's referral count.
 */
async function getReferralCount(userId) {
    const count = await POINTS_STORE.get(`user_referrals_${userId}`);
    return count ? parseInt(count, 10) : 0;
}

/**
 * Sets a user's referral count in the KV store.
 * @param {string} userId The user's ID.
 * @param {number} count The new count value.
 */
async function setReferralCount(userId, count) {
    await POINTS_STORE.put(`user_referrals_${userId}`, count.toString());
}

/**
 * Retrieves a user's referral points from the KV store.
 * @param {string} userId The user's ID.
 * @returns {number} The user's referral points.
 */
async function getReferralPoints(userId) {
    const points = await POINTS_STORE.get(`referral_points_${userId}`);
    return points ? parseInt(points, 10) : 0;
}

/**
 * Sets a user's referral points in the KV store.
 * @param {string} userId The user's ID.
 * @param {number} points The new points value.
 */
async function setReferralPoints(userId, points) {
    await POINTS_STORE.put(`referral_points_${userId}`, points.toString());
}

/**
 * Handles the daily bonus command.
 * @param {number} chatId The ID of the chat.
 * @param {object} user The user object.
 */
async function handleDailyBonus(chatId, user) {
    const userId = user.id.toString();
    const bonus = 10;
    const currentPoints = await getPoints(userId);
    const newPoints = currentPoints + bonus;
    await setPoints(userId, newPoints);

    const message = `<b>🎉 Daily bonus claimed!</b>\n`
                  + `You received ${bonus} points.\n`
                  + `Your new balance is ${newPoints} points.`;

    await telegramApiRequest('sendMessage', {
        chat_id: chatId,
        text: message,
        parse_mode: 'HTML',
        protect_content: true
    });
}

/**
 * Handles the command to generate a referral link.
 * @param {number} chatId The ID of the chat.
 * @param {object} user The user object.
 */
async function handleReferralLink(chatId, user) {
    const uniqueReferralId = user.id.toString();
    const referralLink = `https://t.me/YOUR_BOT_USERNAME?start=${uniqueReferralId}`;

    const message = `
<b>📢 𝗦𝗵𝗮𝗿𝗲 𝘁𝗵𝗶𝘀 𝗹𝗶𝗻𝗸 𝘁𝗼 𝗿𝗲𝗳𝗲𝗿 𝘆𝗼𝘂𝗿 𝗳𝗿𝗶𝗲𝗻𝗱𝘀 𝗮𝗻𝗱 𝗲𝗮𝗿𝗻 𝗽𝗼𝗶𝗻𝘁𝘀! 🤗</b>
    
1 𝘴𝘶𝘤𝘤𝘦𝘴𝘴𝘧𝘶𝘭 𝘳𝘦𝘧𝘦𝘳𝘳𝘢𝘭 = 10 𝘗𝘰𝘪𝘯𝘵𝘴! 🏅
`;
    
    const buttons = [
        [{ text: "✨ Share Link", url: `https://t.me/share/url?url=${encodeURIComponent(referralLink)}&text=${encodeURIComponent('Hey, check out this bot! I got a bonus by joining. You can too!')}` }]
    ];

    await telegramApiRequest('sendMessage', {
        chat_id: chatId,
        text: message,
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: buttons },
        disable_web_page_preview: true,
        protect_content: true
    });
}

/**
 * Handles the referral command by showing referral stats.
 * @param {number} chatId The ID of the chat.
 * @param {object} user The user object.
 */
async function handleReferralInfo(chatId, user) {
    const userId = user.id.toString();
    const referralCount = await getReferralCount(userId);
    const referralPoints = await getReferralPoints(userId);

    const message = `
<b>👥 Total Referrals: ${referralCount}</b>
<b>🏅 Points Earned: ${referralPoints}</b>
    `;

    await telegramApiRequest('sendMessage', {
        chat_id: chatId,
        text: message,
        parse_mode: 'HTML',
        protect_content: true
    });
}

/**
 * Handles the /top command to display the top 10 users by referrals.
 * @param {number} chatId The ID of the chat.
 */
async function handleTopCommand(chatId) {
    const listResponse = await POINTS_STORE.list({ prefix: 'user_referrals_' });
    const userPromises = listResponse.keys.map(async key => {
        const userId = key.name.split('_')[2];
        const referrals = await getReferralCount(userId);
        const points = await getReferralPoints(userId);
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

    await telegramApiRequest('sendMessage', {
        chat_id: chatId,
        text: message,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        protect_content: true
    });
}

/**
 * Handles a user joining via a referral link.
 * @param {number} chatId The ID of the chat.
 * @param {object} user The user object.
 * @param {string} referrerId The ID of the user who referred them.
 */
async function handleReferralCallback(chatId, user, referrerId) {
    const newUserId = user.id.toString();
    const hasBeenReferred = await POINTS_STORE.get(`referred_${newUserId}`);

    if (!hasBeenReferred && referrerId !== newUserId) {
        // Reward the new user
        const newBonus = 10;
        const newPoints = await getPoints(newUserId) + newBonus;
        await setPoints(newUserId, newPoints);

        // Reward the referrer
        const referrerBonus = 10;
        const referrerPoints = await getPoints(referrerId) + referrerBonus;
        await setPoints(referrerId, referrerPoints);

        // Update referrer's referral stats
        const currentReferrals = await getReferralCount(referrerId);
        await setReferralCount(referrerId, currentReferrals + 1);
        const currentReferralPoints = await getReferralPoints(referrerId);
        await setReferralPoints(referrerId, currentReferralPoints + referrerBonus);

        // Mark the new user as having received the referral bonus
        await POINTS_STORE.put(`referred_${newUserId}`, 'true');

        await telegramApiRequest('sendMessage', {
            chat_id: chatId,
            text: `<b>🎉 Welcome! You received ${newBonus} points for joining via a referral link!</b>`,
            parse_mode: 'HTML',
            protect_content: true
        });

        await telegramApiRequest('sendMessage', {
            chat_id: referrerId,
            text: `<b>🎊 Congratulations! Your referral, ${escapeHtml(user.first_name)}, just earned you ${referrerBonus} points!</b>`,
            parse_mode: 'HTML',
            protect_content: true
        });
    }

    await sendWelcomeMessage(chatId, user);
}

/**
 * Handles the points command, showing the user's balance.
 * @param {number} chatId The ID of the chat.
 * @param {object} user The user object.
 */
async function handlePointsCommand(chatId, user) {
    const userPoints = await getPoints(user.id.toString());
    const message = `<b>🏅 Your current points balance:</b>\n\n`
                  + `You have <b>${userPoints}</b> points.`;
    
    await telegramApiRequest('sendMessage', {
        chat_id: chatId,
        text: message,
        parse_mode: 'HTML',
        protect_content: true
    });
}

/**
 * Sends an API request to a specified endpoint.
 * @param {string} endpoint The Telegram API endpoint (e.g., 'sendMessage').
 * @param {object} body The JSON body of the request.
 */
async function telegramApiRequest(endpoint, body) {
    const url = `${BASE_URL}/${endpoint}`;
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
 * Sends a welcome message with a video and buttons.
 * @param {number} chatId The ID of the chat.
 * @param {object} user The user object.
 */
async function sendWelcomeMessage(chatId, user) {
    const videoUrl = "https://t.me/kajal_developer/57";
    const buttons = [
        [{ text: "Commands", callback_data: "/Commands" }],
        [{ text: "DEV", url: "https://t.me/pornhub_Developer" }]
    ];
    
    const userPoints = await getPoints(user.id.toString());

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
        chat_id: chatId,
        video: videoUrl,
        caption: caption,
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: buttons },
        protect_content: true
    });
}

/**
 * Sends the commands menu.
 * @param {number} chatId The ID of the chat.
 */
async function sendCommandsMenu(chatId) {
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
        chat_id: chatId,
        video: videoUrl,
        caption: caption,
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: buttons },
        protect_content: true
    });
}

/**
 * Deletes a message.
 * @param {number} chatId The ID of the chat.
 * @param {number} messageId The ID of the message to delete.
 */
async function deleteMessage(chatId, messageId) {
    await telegramApiRequest('deleteMessage', {
        chat_id: chatId,
        message_id: messageId,
    });
}

/**
 * Answers a callback query to stop the loading animation on the button.
 * @param {string} callbackQueryId The ID of the callback query.
 */
async function answerCallbackQuery(callbackQueryId) {
    await telegramApiRequest('answerCallbackQuery', {
        callback_query_id: callbackQueryId,
    });
}

/**
 * Sends an "About" message.
 * @param {number} chatId The ID of the chat.
 * @param {object} user The user object.
 */
async function sendAboutMessage(chatId, user) {
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

    await telegramApiRequest('sendMessage', {
        chat_id: chatId,
        text: aboutMessage,
        parse_mode: 'HTML',
        protect_content: true,
        disable_web_page_preview: true
    });
}

/**
 * Sends a keyboard with video categories.
 * @param {number} chatId The ID of the chat.
 */
async function sendVbMenu(chatId) {
    const keyboard = {
        keyboard: [
            ["🌺 CP", "🇮🇳 Desi"],
            ["🇬🇧 Forener", "🐕‍🦺 Animal"],
            ["💕 Webseries", "💑 Gay Cp"],
            ["💸 𝘽𝙐𝙔 𝙑𝙄𝙋 💸"]
        ],
        resize_keyboard: true,
        one_time_keyboard: false
    };

    await telegramApiRequest('sendMessage', {
        chat_id: chatId,
        text: "🤗 Welcome to Lx Bot 🌺",
        reply_markup: keyboard,
        protect_content: true
    });
}

/**
 * Sends user information with a "Copy User ID" button.
 * @param {number} chatId The ID of the chat.
 * @param {object} user The user object.
 */
async function sendUserInfo(chatId, user) {
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
    
    const buttons = [
        [{ text: "Copy User ID", url: `tg://user?id=${user.id}` }]
    ];

    await telegramApiRequest('sendMessage', {
        chat_id: chatId,
        text: infoMessage,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        protect_content: true,
        reply_markup: { inline_keyboard: buttons }
    });
}

/**
 * Sends a series of videos.
 * @param {number} chatId The ID of the chat.
 */
async function sendVideo1(chatId) {
    const videoUrls = [
        "https://t.me/igftcd/7",
        "https://t.me/igftcd/8",
        "https://t.me/igftcd/9",
        "https://t.me/igftcd/10",
        "https://t.me/igftcd/12",
    ];

    const channelName = "pornhub_Developer";
    const buttons = [
        [
            {
                text: "Join " + channelName,
                url: "https://t.me/" + channelName
            }
        ]
    ];
    
    for (const videoUrl of videoUrls) {
        await telegramApiRequest('sendVideo', {
            chat_id: chatId,
            video: videoUrl,
            reply_markup: { inline_keyboard: buttons },
            protect_content: true
        });
    }
}

/**
 * Utility function to escape HTML entities in a string.
 * @param {string} str The string to escape.
 * @returns {string} The escaped string.
 */
function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;')
              .replace(/'/g, '&#039;');
}

// Attach the fetch event listener for Cloudflare Workers
addEventListener('fetch', event => {
    event.respondWith(handleRequest(event.request));
});
