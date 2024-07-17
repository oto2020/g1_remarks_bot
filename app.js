require('dotenv').config();
const fs = require('fs');
const TelegramBot = require('node-telegram-bot-api');
const { saveMessage, getAllMessages, updateUserRoom, getCurrentRoom, getMessageCountForRoom, getMessagesForRoom } = require('./controllers/dbController');

const token = process.env.TOKEN;
const bot = new TelegramBot(token, { polling: true });

const groupId = '-4263608042'; // Идентификатор группы

// Load rooms data
const rooms = JSON.parse(fs.readFileSync('rooms.json', 'utf8'));

// Function to generate main menu
const generateMainMenu = async () => {
    const buttons = await Promise.all(Object.keys(rooms).map(async key => {
        const count = await getMessageCountForRoom(key);
        return [{ text: `${rooms[key].title} (${count})`, callback_data: key }];
    }));
    return {
        reply_markup: {
            inline_keyboard: buttons
        }
    };
};

// Function to generate back button
const backButton = (department) => {
    return {
        reply_markup: {
            inline_keyboard: [
                [{ text: 'Назад к отделу', callback_data: `back_to_${department}` }]
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

const sendMessagesForRoom = async (chatId, callbackData) => {
    const messages = await getMessagesForRoom(callbackData);
    if (messages.length > 0) {
        await bot.sendMessage(chatId, `🤖 Ранее выписали по помещению "${callbackData}":`);
    } else {
        await bot.sendMessage(chatId, `🤖 Сообщения по помещению "${callbackData}" отсутствуют. Пожалуйста, сделайте фото и оставьте комментарий.`);
    }
    for (let i = 0; i < messages.length; i++) {
        let message = messages[i];
        const formattedTimestamp = new Date(message.timestamp).toISOString().slice(0, 19).replace('T', ' ');
        if (message.type === 'text') {
            await bot.sendMessage(chatId, `${message.content}\n[${formattedTimestamp}]`);
        }
        if (message.type === 'photo') {
            await bot.sendPhoto(chatId, message.content, { caption: `[${formattedTimestamp}]` });
        }
    }
    await bot.sendMessage(chatId, `🤖 Если есть чем дополнить, вы можете сделать это.`);
};


// Start command
bot.onText(/\/start/, async (msg) => {
    await saveMessage(msg.from.id.toString(), msg.chat.id, null, msg.text, 'text', msg.text);
    bot.sendMessage(msg.chat.id, 'Выберите отдел:', await generateMainMenu());
});

// Message handler
bot.on('message', async (msg) => {
    if (msg.from.id !== bot.id) {
        const currentRoom = await getCurrentRoom(msg.from.id.toString());

        if (msg.text) {
            if (currentRoom && currentRoom !== 'none') {
                await saveMessage(msg.from.id.toString(), msg.chat.id, currentRoom, msg.text, 'text', msg.text);
            } else {
                bot.sendMessage(msg.chat.id, 'Ваше сообщение не будет сохранено, выберите сначала помещение');
            }
        } else if (msg.photo) {
            const fileId = msg.photo[msg.photo.length - 1].file_id;
            await saveMessage(msg.from.id.toString(), msg.chat.id, currentRoom, fileId, 'photo', null);
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
                const messageText = `Вы находитесь тут 📍\n${rooms[department].title}: ${room.name}\n\n${room.intermediate_message}`;
                bot.sendMessage(msg.chat.id, messageText, backButton(department));
                // await saveMessage(callbackQuery.from.id.toString(), msg.chat.id, data, messageText, 'callback', data);
                await updateUserRoom(callbackQuery.from.id.toString(), data);
                await sendMessagesForRoom(msg.chat.id, data);
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
