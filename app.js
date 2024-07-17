require('dotenv').config();
const fs = require('fs');
const TelegramBot = require('node-telegram-bot-api');
const { saveMessage, getAllMessages, updateUserRoom, getCurrentRoom } = require('./controllers/dbController');

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

// Start command
bot.onText(/\/start/, async (msg) => {
    await saveMessage(msg.from.id.toString(), msg.chat.id, null, msg.text, 'text', msg.text);
    bot.sendMessage(msg.chat.id, 'Выберите отдел:', generateMainMenu());
});

// Message handler
bot.on('message', async (msg) => {
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
});

// Callback query handler
bot.on('callback_query', async (callbackQuery) => {
    const msg = callbackQuery.message;
    const data = callbackQuery.data;

    if (data === 'back_to_departments') {
        bot.sendMessage(msg.chat.id, 'Выберите отдел:', generateMainMenu());
        await updateUserRoom(callbackQuery.from.id.toString(), 'none');
    } else if (rooms[data]) {
        bot.sendMessage(msg.chat.id, `Выберите подразделение:`, generateRoomMenu(data));
        await updateUserRoom(callbackQuery.from.id.toString(), 'none');
    } else {
        let found = false;
        for (const department in rooms) {
            const room = rooms[department].rooms.find(r => r.callback_data === data);
            if (room) {
                const messageText = `📍${rooms[department].title}\n📍${room.name}\n\n${room.intermediate_message}`;
                bot.sendMessage(msg.chat.id, messageText, backButton(department));
                // await saveMessage(callbackQuery.from.id.toString(), msg.chat.id, data, messageText, 'callback', data);
                await updateUserRoom(callbackQuery.from.id.toString(), data);
                found = true;
                break;
            } else if (data === `back_to_${department}`) {
                bot.sendMessage(msg.chat.id, `Вы вернулись к отделу: ${rooms[department].title}`, generateRoomMenu(department));
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
