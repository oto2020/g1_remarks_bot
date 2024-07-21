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
const generateMainMenu = async () => {
    // Количество сообщений по всем помещениям департамента
    const getMessageCountForDepartment = async (departmentKey) => {
        const department = rooms[departmentKey];
        let totalMessages = 0;
        let roomsWithComments = 0;

        for (const room of department.rooms) {
            const count = await db.getMessageCountForRoom(room.callback_data) || await db.getMessageStatusGoodCountForRoom(room.callback_data);
            totalMessages += count;
            if (count > 0) {
                roomsWithComments += 1;
            }
        }
        return { totalMessages, roomsWithComments, totalRooms: department.rooms.length };
    };

    const buttons = await Promise.all(Object.keys(rooms).map(async key => {
        const { totalMessages, roomsWithComments, totalRooms } = await getMessageCountForDepartment(key);
        let check = STATUS_DEPARTMENT_EMPTY;
        if (roomsWithComments == totalRooms) {
            check = STATUS_DEPARTMENT_FULL;
        } else if (roomsWithComments > 0 ) {
            check = STATUS_DEPARTMENT_PARTLY;
        }
        return [{ text: `${check} ${rooms[key].title} ${roomsWithComments}/${totalRooms} (${totalMessages})`, callback_data: key }];
    }));
    return {
        reply_markup: {
            inline_keyboard: buttons
        }
    };
};
async function sendMainMenu(bot, chatId) {
    await bot.sendMessage(chatId, 'Выберите отдел:', await generateMainMenu());
}


// ГЕНЕРАЦИЯ ВТОРОГО МЕНЮ ПОМЕЩЕНИЙ, 
const generateRoomMenu = async (department) => {
    const buttons = await Promise.all(rooms[department].rooms.map(async room => {
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
    return {
        reply_markup: {
            inline_keyboard: buttons
        }
    };
};
async function sendRoomMenu(bot, chatId, departmentKey) {
    await bot.sendMessage(chatId, `Вы вернулись к отделу: \n📍${rooms[departmentKey].title}`, await generateRoomMenu(departmentKey));
}


// Function to send all messages of a room to the user
const sendMessagesForRoom = async (bot, chatId, messages) => {

    let firstTimestamp = null;
    let lastTimestamp = null;

    if (messages.length > 0) {
        firstTimestamp = new Date(messages[0].timestamp).toISOString().slice(0, 19).replace('T', ' ');
        lastTimestamp = new Date(messages[messages.length - 1].timestamp).toISOString().slice(0, 19).replace('T', ' ');
        console.log(firstTimestamp, lastTimestamp);
        await bot.sendMessage(chatId, `🤖 Ранее вы писали:`);
    } else {
        // await bot.sendMessage(chatId, `🤖 Сообщения по помещению ${room.departmentTitle} "${room.roomName}" отсутствуют. Пожалуйста, сделайте фото и оставьте комментарий.`);
    }

    let photoGroup = [];
    let currentCaption = '';
    let lastTextMessage = null;

    for (let i = 0; i < messages.length; i++) {
        let message = messages[i];
        const date = new Date(message.timestamp);
        const minutes = date.getMinutes().toString().padStart(2, '0');
        const hours = date.getHours().toString().padStart(2, '0');
        let messageText = `👤 ${message.user.name} (${hours}:${minutes})\n` + message.text;
        if (message.type === 'text') {
            if (lastTextMessage !== null) {
                await bot.sendMessage(chatId, lastTextMessage);

                lastTextMessage = null;
            }
            if (photoGroup.length > 0) {
                await bot.sendMediaGroup(chatId, photoGroup);
                photoGroup = [];
                currentCaption = '';
            }
            lastTextMessage = `${messageText}`;
        }

        if (message.type === 'photo') {
            if (photoGroup.length > 0 && message.text && message.text !== currentCaption) {
                await bot.sendMediaGroup(chatId, photoGroup);
                photoGroup = [];
                currentCaption = '';
            }
            if (photoGroup.length === 0) {
                currentCaption = message.text ? `${messageText}` : '';
                photoGroup.push({ type: 'photo', media: message.content, caption: currentCaption });
            } else {
                photoGroup.push({ type: 'photo', media: message.content });
            }
        }
    }

    if (lastTextMessage !== null) {
        await bot.sendMessage(chatId, lastTextMessage);
    }
    if (photoGroup.length > 0) {
        await bot.sendMediaGroup(chatId, photoGroup);
    }
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
