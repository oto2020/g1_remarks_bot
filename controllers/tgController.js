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
    let allTextMessages = ""; // Общий текст сообщений
    let photoGroup = []; // Группа фото для отправки
    let room = getRoomByCallbackData(messages[0].callbackData);
    const locationFooter = `📍 ${room.departmentTitle}\n➡️ ${room.roomName}`;

    for (let i = 0; i < messages.length; i++) {
        let message = messages[i];
        const date = new Date(message.timestamp);
        const minutes = date.getMinutes().toString().padStart(2, '0');
        const hours = date.getHours().toString().padStart(2, '0');

        // Добавляем текст сообщения в общий текст
        if (message.text) {
            allTextMessages += `👤 ${message.text}\n✍️ ${message.user.name} (${hours}:${minutes})\n\n`;
        }
        
        if (message.type === 'photo') {
            // Добавляем фото в группу
            photoGroup.push({ type: 'photo', media: message.content });
        }
    }

    // Добавляем подпись с расположением в конец общего текста
    allTextMessages += locationFooter;

    try {
        // Проверяем, есть ли фотографии, и отправляем их с общей подписью
        if (photoGroup.length > 0) {
            photoGroup[0].caption = allTextMessages.trim(); // Добавляем общий текст к первой фотографии
            await sendWithRetry(() => bot.sendMediaGroup(chatId, photoGroup));
        } else if (allTextMessages.length > 0) {
            // Если фотографий нет, отправляем только текст
            await sendWithRetry(() => bot.sendMessage(chatId, allTextMessages, { parse_mode: 'Markdown' }));
        }
    } catch (error) {
        console.error('Error sending message:', error);
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
