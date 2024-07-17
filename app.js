require('dotenv').config();
const fs = require('fs');
const TelegramBot = require('node-telegram-bot-api');
const { saveMessage, getAllMessages, updateUserRoom, getCallbackData, getMessageCountForRoom, getMessagesForRoom } = require('./controllers/dbController');

const token = process.env.TOKEN;
const bot = new TelegramBot(token, { polling: true });

const groupId = '-4263608042'; // Идентификатор группы

// Load rooms data
const rooms = JSON.parse(fs.readFileSync('rooms.json', 'utf8'));


// Function to count messages for a department and check if all rooms have comments
const getMessageCountForDepartment = async (departmentKey) => {
    const department = rooms[departmentKey];
    let totalMessages = 0;
    let roomsWithComments = 0;

    for (const room of department.rooms) {
        const count = await getMessageCountForRoom(room.callback_data);
        totalMessages += count;
        if (count > 0) {
            roomsWithComments += 1;
        }
    }

    return { totalMessages, roomsWithComments, totalRooms: department.rooms.length };
};

// Function to generate main menu
const generateMainMenu = async () => {
    const buttons = await Promise.all(Object.keys(rooms).map(async key => {
        const { totalMessages, roomsWithComments, totalRooms } = await getMessageCountForDepartment(key);
        return [{ text: `${rooms[key].title} ${roomsWithComments}/${totalRooms} (${totalMessages})`, callback_data: key }];
    }));
    return {
        reply_markup: {
            inline_keyboard: buttons
        }
    };
};

// Function to generate back button
const backButtonForDepartmentKey = (departmentKey) => {
    return {
        reply_markup: {
            inline_keyboard: [
                [{ text: 'Назад к отделу', callback_data: `back_to_${departmentKey}` }]
            ]
        }
    };
};

// Function to generate room menu
const generateRoomMenu = async (department) => {
    const buttons = await Promise.all(rooms[department].rooms.map(async room => {
        const count = await getMessageCountForRoom(room.callback_data);
        return [{ text: `${room.name} (${count})`, callback_data: room.callback_data }];
    }));
    buttons.push([{ text: 'Назад к отделам', callback_data: 'back_to_departments' }]);
    return {
        reply_markup: {
            inline_keyboard: buttons
        }
    };
};

const getRoomByCallbackData = (callbackData) => {
    for (const departmentKey in rooms) {
        const department = rooms[departmentKey];
        const room = department.rooms.find(room => room.callback_data === callbackData);
        if (room) {
            return {
                departmentKey: departmentKey,
                departmentTitle: department.title,
                roomName: room.name,
                roomIntermediateMessage: room.intermediate_message,
                roomCallbackData: room.callback_data
            };
        }
    }
    return null; // Возвращает null, если помещение не найдено
};


// Function to send all messages of a room to the user
const sendMessagesForRoom = async (chatId, callbackData) => {
    let room = getRoomByCallbackData(callbackData);
    let destination = `📍${room.departmentTitle} "${room.roomName}"`;
    const messages = await getMessagesForRoom(callbackData);

    let firstTimestamp = null;
    let lastTimestamp = null;

    if (messages.length > 0) {
        firstTimestamp = new Date(messages[0].timestamp).toISOString().slice(0, 19).replace('T', ' ');
        lastTimestamp = new Date(messages[messages.length - 1].timestamp).toISOString().slice(0, 19).replace('T', ' ');
        console.log(firstTimestamp, lastTimestamp);
        await bot.sendMessage(chatId, `🤖 Ранее вы писали\n${destination} `);
    } else {
        // await bot.sendMessage(chatId, `🤖 Сообщения по помещению ${room.departmentTitle} "${room.roomName}" отсутствуют. Пожалуйста, сделайте фото и оставьте комментарий.`);
    }

    let photoGroup = [];
    let currentCaption = '';
    let lastTextMessage = null;

    for (let i = 0; i < messages.length; i++) {
        let message = messages[i];

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
            lastTextMessage = `${message.content}`;
        }

        if (message.type === 'photo') {
            if (photoGroup.length > 0 && message.text && message.text !== currentCaption) {
                await bot.sendMediaGroup(chatId, photoGroup);
                photoGroup = [];
                currentCaption = '';
            }
            if (photoGroup.length === 0) {
                currentCaption = message.text ? `${message.text}` : '';
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

    const count = await getMessageCountForRoom(callbackData);
    await bot.sendMessage(chatId, `🤖 Вы можете дополнить ${count} замечаний, пишите мне в ответ, подкрепляя фотографиями!`);
};




// Start command
bot.onText(/\/start/, async (msg) => {
    await saveMessage(msg.from.id.toString(), msg.chat.id, null, msg.text, 'text', msg.text);
    bot.sendMessage(msg.chat.id, 'Выберите отдел:', await generateMainMenu());
});

// Message handler
bot.on('message', async (msg) => {
    if (msg.from.id !== bot.id) {
        const callbackData = await getCallbackData(msg.from.id.toString());
        console.log(callbackData);

        if (msg.text) {
            if (callbackData && callbackData !== 'none') {
                await saveMessage(msg.from.id.toString(), msg.chat.id, callbackData, msg.text, 'text', msg.text);
                const count = await getMessageCountForRoom(callbackData);
                let room = getRoomByCallbackData(callbackData);
                // console.log(room);
                bot.sendMessage(msg.chat.id, `Спасибо!\nСообщения дополнены (${count})`, backButtonForDepartmentKey(room.departmentKey));
            } else {
                bot.sendMessage(msg.chat.id, 'Ваше сообщение не будет сохранено, выберите сначала помещение');
            }
        } else if (msg.photo) {
            const fileId = msg.photo[msg.photo.length - 1].file_id;
            const caption = msg.caption || null; // Получаем подпись к фото, если она есть
            await saveMessage(msg.from.id.toString(), msg.chat.id, currentRoom, fileId, 'photo', caption);
        }
    }
});

// Callback query handler
bot.on('callback_query', async (callbackQuery) => {
    const msg = callbackQuery.message;
    const data = callbackQuery.data;

    if (data === 'back_to_departments') {
        bot.sendMessage(msg.chat.id, 'Выберите отдел:', await generateMainMenu());
        await updateUserRoom(callbackQuery.from.id.toString(), 'none');
    } else if (rooms[data]) {
        bot.sendMessage(msg.chat.id, 'Выберите подразделение:', await generateRoomMenu(data));
        await updateUserRoom(callbackQuery.from.id.toString(), 'none');
    } else {
        let found = false;
        for (const department in rooms) {
            const room = rooms[department].rooms.find(r => r.callback_data === data);
            if (room) {
                let destination = `📍${rooms[department].title}: ${room.name}`;
                // Обновляем комнату пользователя
                await updateUserRoom(callbackQuery.from.id.toString(), data);

                // Возвращаем истоию сообщений в этой комнате
                await sendMessagesForRoom(msg.chat.id, data);

                // Описываем криетрии и кнопка "Назад"
                const messageText = `${room.intermediate_message}\n\n${destination}`;
                bot.sendMessage(msg.chat.id, messageText, backButtonForDepartmentKey(department));
                found = true;
                break;
            } else if (data === `back_to_${department}`) {
                bot.sendMessage(msg.chat.id, `Вы вернулись к отделу: ${rooms[department].title}`, await generateRoomMenu(department));
                await updateUserRoom(callbackQuery.from.id.toString(), 'none');
                found = true;
                break;
            }
        }
        if (!found) {
            bot.sendMessage(msg.chat.id, 'Ошибка: Комната не найдена.');
        }
    }
});

console.log('https://t.me/g1_remarks_bot');
