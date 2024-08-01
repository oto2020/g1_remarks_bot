// controllers/tgController.js

const fs = require('fs');
const db = require('./dbController');

const groupId = '-4263608042'; // Идентификатор группы

// Load rooms data
const rooms = JSON.parse(fs.readFileSync('rooms.json', 'utf8'));


const STATUS_DEPARTMENT_FULL = '✅';       // check
const STATUS_DEPARTMENT_PARTLY = '☑️';     // check
const STATUS_DEPARTMENT_EMPTY = '✖️';
const STATUS_ROOM_EMPTY = '✖️';
const STATUS_ROOM_GOOD = '👍';       // 100%
const STATUS_ROOM_COMMENTED = '✍️';       // 100%


// ГЕНЕРАЦИЯ ГЛАВНОГО МЕНЮ ПОДРАЗДЕЛЕНИЙ
async function sendMainMenu(bot, chatId, currentDay, userName) {
    let counter = 0;
    const buttons = await Promise.all(Object.keys(rooms).map(async key => {
        // Количество сообщений по всем помещениям департамента
        let department = rooms[key];
        let totalMessages = 0;
        let roomsWithComments = 0;
        for (const room of department.rooms) {
            const count = await db.getMessageCountForRoom(room.callback_data) || await db.getMessageStatusGoodCountForRoom(room.callback_data);
            totalMessages += count;
            if (count > 0) {
                roomsWithComments += 1;
            }
        }
        let totalRooms = department.rooms.length;

        let check = STATUS_DEPARTMENT_EMPTY;
        if (roomsWithComments == totalRooms) {
            check = STATUS_DEPARTMENT_FULL;
            counter++;
        } else if (roomsWithComments > 0 ) {
            check = STATUS_DEPARTMENT_PARTLY;
        }
        return [{ text: `${check} ${rooms[key].title} ${roomsWithComments}/${totalRooms} (${totalMessages})`, callback_data: key }];
    }));
    if (counter === buttons.length) {
        console.log('Обход завершен!');
        buttons.push(
            [
                {
                    text: "🥳 ОТПРАВИТЬ РЕЗУЛЬТАТ ЗА СЕГОДНЯ В ЧАТ! 🥳",
                    callback_data: "SEND_TO_GROUP",
                },
            ]
        );
    }
    let inlineKeyBoard = {
        reply_markup: {
            inline_keyboard: buttons
        }
    };
    await bot.sendMessage(chatId, `Обход ${currentDay} ${userName}\nВыберите отдел:`, inlineKeyBoard);
}


// ГЕНЕРАЦИЯ ВТОРОГО МЕНЮ ПОМЕЩЕНИЙ
async function sendRoomMenu(bot, chatId, departmentKey) {
    const buttons = await Promise.all(rooms[departmentKey].rooms.map(async room => {
        const count = await db.getMessageCountForRoom(room.callback_data);
        const status = await db.getRoomStatus(room.callback_data);
        let prependText = '';
        if (status === 'good') {
            prependText = STATUS_ROOM_GOOD 
        } else if (count == 0) {
            prependText = STATUS_ROOM_EMPTY;
        } else {
            prependText = STATUS_ROOM_COMMENTED;
        }
        let appendText = '(' + count + ')';
        return [{ text: `${prependText} ${room.name} ${appendText}`, callback_data: room.callback_data }];
    }));
    buttons.push([{ text: 'Назад к отделам', callback_data: 'back_to_departments' }]);
    let inlineKeyBoard = {
        reply_markup: {
            inline_keyboard: buttons
        }
    };
    await bot.sendMessage(chatId, `Вы вернулись к отделу: \n📍${rooms[departmentKey].title}`, inlineKeyBoard);
}



const getRoomByCallbackData = (callbackData) => {
    for (const departmentKey in rooms) {
        const department = rooms[departmentKey];
        const room = department.rooms.find(room => room.callback_data === callbackData);
        if (room) {
            return {
                departmentKey,
                departmentTitle: department.title,
                roomName: room.name,
                roomIntermediateMessage: room.intermediate_message,
                roomCallbackData: room.callback_data
            };
        }
    }
    return null;
};



const sendMessagesForRoom = async (bot, chatId, messages) => {
    let appendTextMessage = ""; 
    let firstTimestamp = null;
    let lastTimestamp = null;

    if (messages.length > 0) {
        firstTimestamp = new Date(messages[0].timestamp).toISOString().slice(0, 19).replace('T', ' ');
        lastTimestamp = new Date(messages[messages.length - 1].timestamp).toISOString().slice(0, 19).replace('T', ' ');
    }

    let photoGroup = [];
    let currentCaption = '';
    let lastTextMessage = null;
    const separator = "\n-----------------------------\n";

    for (let i = 0; i < messages.length; i++) {
        let message = messages[i];
        let room = getRoomByCallbackData(message.callbackData);
        const date = new Date(message.timestamp);
        const minutes = date.getMinutes().toString().padStart(2, '0');
        const hours = date.getHours().toString().padStart(2, '0');
        let messageText = (message.text || '') + '\n';  // Убедитесь, что messageText не содержит 'null'
        appendTextMessage = `👤 ${message.user.name} (${hours}:${minutes})\n\n📍${room.departmentTitle}\n➡️ ${room.roomName}`;

        try {
            if (message.type === 'text') {
                if (lastTextMessage !== null) {
                    await sendWithRetry(() => bot.sendMessage(chatId, lastTextMessage + "\n" + appendTextMessage + separator));
                    lastTextMessage = null;
                }
                if (photoGroup.length > 0) {
                    await sendWithRetry(() => bot.sendMediaGroup(chatId, photoGroup));
                    photoGroup = [];
                    currentCaption = '';
                }
                lastTextMessage = `${messageText}`;
            }

            if (message.type === 'photo') {
                if (message.text || appendTextMessage) { // Проверяем также наличие appendTextMessage
                    currentCaption = `${messageText}${appendTextMessage ? `\n${appendTextMessage}` : ''}`;
                    if (photoGroup.length > 0) {
                        photoGroup.push({ type: 'photo', media: message.content, caption: currentCaption });
                        await sendWithRetry(() => bot.sendMediaGroup(chatId, photoGroup));
                        photoGroup = [];
                    } else {
                        await sendWithRetry(() => bot.sendPhoto(chatId, message.content, { caption: currentCaption + separator }));
                    }
                    currentCaption = '';
                } else {
                    photoGroup.push({ type: 'photo', media: message.content });
                }
            }
            
        } catch (error) {
            console.error('Error sending message:', error);
        }
    }

    if (lastTextMessage !== null) {
        await sendWithRetry(() => bot.sendMessage(chatId, lastTextMessage + "\n" + appendTextMessage + separator));
    }
    if (photoGroup.length > 0) {
        await sendWithRetry(() => bot.sendMediaGroup(chatId, photoGroup, { caption: appendTextMessage + separator }));
    }
};













// Helper function to send messages with retry on failure
const sendWithRetry = async (sendFunction) => {
    let attempt = 0;
    const maxAttempts = 500;
    let delay = 1000; // Start with 1 second

    while (attempt < maxAttempts) {
        try {
            await sendFunction();
            return;
        } catch (error) {
            if (error.code === 'ETELEGRAM' && error.response && error.response.body.error_code === 429) {
                const retryAfter = error.response.body.parameters.retry_after;
                console.warn(`Too many requests. Retrying after ${retryAfter || delay} seconds.`);
                await new Promise(resolve => setTimeout(resolve, (retryAfter || delay) * 1000));
            } else {
                throw error; // Re-throw non-rate limit errors
            }
        }
        attempt++;
        delay *= 2; // Exponential backoff
    }

    throw new Error('Max retry attempts reached. Could not send message.');
};


async function sendContactRequest (bot, chatId) {
    await bot.sendMessage(chatId, '🤖 Пожалуйста, поделитесь своим контактом для продолжения.', {
        reply_markup: {
            one_time_keyboard: true,
            keyboard: [
                [{
                    text: 'Поделиться контактом',
                    request_contact: true
                }]
            ]
        }
    });
}
// async function functionName () {};
module.exports = {
    sendMessagesForRoom,
    sendMainMenu,
    sendRoomMenu,
    sendContactRequest
};
