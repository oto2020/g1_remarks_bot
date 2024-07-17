require('dotenv').config();
const fs = require('fs');
const TelegramBot = require('node-telegram-bot-api');
const { saveMessage, getAllMessages } = require('./controllers/dbController');

const token = process.env.TOKEN;
const bot = new TelegramBot(token, { polling: true });

const groupId = '-4263608042'; // Идентификатор группы

// Load rooms data
const rooms = JSON.parse(fs.readFileSync('rooms.json', 'utf8'));

// Function to generate main menu
const generateMainMenu = () => {
    const buttons = Object.keys(rooms).map(key => {
        return [{ text: rooms[key].title, callback_data: key }];
    });
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
const generateRoomMenu = (department) => {
    const buttons = rooms[department].rooms.map(room => {
        return [{ text: room.name, callback_data: room.callback_data }];
    });
    buttons.push([{ text: 'Назад к отделам', callback_data: 'back_to_departments' }]);
    return {
        reply_markup: {
            inline_keyboard: buttons
        }
    };
};

// Function to send all messages of a user to the group
const sendAllMessagesToGroup = async (telegramId) => {
    const messages = await getAllMessages(telegramId);
    const messageTexts = messages.map(msg => `[${msg.timestamp.toISOString()}] ${msg.type.toUpperCase()}: ${msg.content}`).join('\n');
    if (messageTexts.length > 0) {
        bot.sendMessage(groupId, `Messages from user ${telegramId}:\n${messageTexts}`);
    }
};

// Start command
bot.onText(/\/start/, async (msg) => {
    await saveMessage(msg.from.id.toString(), msg.text, 'text', msg.text);
    bot.sendMessage(msg.chat.id, 'Выберите отдел:', generateMainMenu());
    await sendAllMessagesToGroup(msg.from.id.toString());
});

// Message handler
bot.on('message', async (msg) => {
    if (msg.text) {
        await saveMessage(msg.from.id.toString(), msg.text, 'text', msg.text);
    } else if (msg.photo) {
        const fileId = msg.photo[msg.photo.length - 1].file_id;
        const fileLink = await bot.getFileLink(fileId);
        await saveMessage(msg.from.id.toString(), fileLink, 'photo', null);
    }
    await sendAllMessagesToGroup(msg.from.id.toString());
});

// Callback query handler
bot.on('callback_query', async (callbackQuery) => {
    const msg = callbackQuery.message;
    const data = callbackQuery.data;

    await saveMessage(callbackQuery.from.id.toString(), data, 'callback', data);
    await sendAllMessagesToGroup(callbackQuery.from.id.toString());

    if (data === 'back_to_departments') {
        bot.sendMessage(msg.chat.id, 'Выберите отдел:', generateMainMenu());
    } else if (rooms[data]) {
        bot.sendMessage(msg.chat.id, `Вы выбрали: ${rooms[data].title}`, generateRoomMenu(data));
    } else {
        let found = false;
        for (const department in rooms) {
            const room = rooms[department].rooms.find(r => r.callback_data === data);
            if (room) {
                bot.sendMessage(msg.chat.id, room.intermediate_message, backButton(department));
                found = true;
                break;
            } else if (data === `back_to_${department}`) {
                bot.sendMessage(msg.chat.id, `Вы вернулись к отделу: ${rooms[department].title}`, generateRoomMenu(department));
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
