require('dotenv').config();
const fs = require('fs');
const TelegramBot = require('node-telegram-bot-api');
const db = require('./controllers/dbController');
const tg = require('./controllers/tgController');

const token = process.env.TOKEN;
const bot = new TelegramBot(token, { polling: true });

const groupId = '-4263608042'; // Идентификатор группы

// Load rooms data
const rooms = JSON.parse(fs.readFileSync('rooms.json', 'utf8'));

const STATUS_ROOM_GOOD = '👍';
const STATUS_ROOM_COMMENTED = '✍️';

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

const sendRoomMenu = async (chatId, departmentKey) => {
    await tg.sendRoomMenu(bot, chatId, departmentKey);
    await db.updateUserRoom(chatId.toString(), 'none');
};

const sendBackButton = (departmentKey) => ({
    reply_markup: {
        inline_keyboard: [[{ text: 'Назад к отделу', callback_data: `back_to_${departmentKey}` }]]
    }
});

const handleMessage = async (msg) => {
    const callbackData = await db.getCallbackData(msg.from.id.toString());
    if (callbackData === 'none') {
        await tg.sendMainMenu(bot, msg.chat.id);
        return;
    }

    if (msg.text) {
        await db.saveMessage(msg.from.id.toString(), msg.chat.id, callbackData, msg.text, 'text', msg.text);
    } else if (msg.photo) {
        const fileId = msg.photo[msg.photo.length - 1].file_id;
        const caption = msg.caption || null;
        await db.saveMessage(msg.from.id.toString(), msg.chat.id, callbackData, fileId, 'photo', caption);
    }

    const count = await db.getMessageCountForRoom(callbackData);
    const room = getRoomByCallbackData(callbackData);
    if (!room) return;

    bot.sendMessage(
        msg.chat.id,
        `🤖 Спасибо!\nСообщения (${count}) дополнены.\nВы можете продолжить в этом чате или перейти к следующей комнате.`,
        sendBackButton(room.departmentKey)
    );
};

const handleCallbackQuery = async (callbackQuery) => {
    const msg = callbackQuery.message;
    const data = callbackQuery.data;

    if (data.startsWith('mark_good_')) {
        const roomCallbackData = data.replace('mark_good_', '');
        await db.saveRoomStatus(callbackQuery.from.id.toString(), roomCallbackData, 'good');
        const count = await db.getMessageCountForRoom(roomCallbackData);
        const room = getRoomByCallbackData(roomCallbackData);

        await bot.sendMessage(
            msg.chat.id,
            `🤖 Комната отмечена как в порядке ${STATUS_ROOM_GOOD}\nЗамечания (${count}) переданы не будут!`
        );

        await sendRoomMenu(msg.chat.id, room.departmentKey);
        return;
    }

    if (data.startsWith('open_comments_')) {
        const roomCallbackData = data.replace('open_comments_', '');
        await db.saveRoomStatus(callbackQuery.from.id.toString(), roomCallbackData, 'pending');
        const room = getRoomByCallbackData(roomCallbackData);

        const messages = await db.getMessagesForRoom(roomCallbackData);
        await tg.sendMessagesForRoom(bot, msg.chat.id, messages);

        bot.sendMessage(
            msg.chat.id,
            `Вы можете продолжать комментировать.\nЗамечания открыты ${STATUS_ROOM_COMMENTED}`,
            sendBackButton(room.departmentKey)
        );
        return;
    }

    if (data === 'back_to_departments') {
        await tg.sendMainMenu(bot, msg.chat.id);
        await db.updateUserRoom(callbackQuery.from.id.toString(), 'none');
        return;
    }

    if (rooms[data]) {
        await sendRoomMenu(msg.chat.id, data);
        return;
    }

    for (const department in rooms) {
        const room = rooms[department].rooms.find(r => r.callback_data === data);
        if (room) {
            await handleRoomSelection(callbackQuery, data, room, department);
            return;
        }

        if (data === `back_to_${department}`) {
            await sendRoomMenu(msg.chat.id, department);
            return;
        }
    }

    bot.sendMessage(msg.chat.id, 'Ошибка: Комната не найдена.');
};

const handleRoomSelection = async (callbackQuery, data, room, department) => {
    const msg = callbackQuery.message;
    const destination = `📍 ${rooms[department].title}\n➡️ ${room.name}`;
    const count = await db.getMessageCountForRoom(data);
    const status = await db.getRoomStatus(data);

    await db.updateUserRoom(callbackQuery.from.id.toString(), data);

    if (status !== 'good') {
        const messages = await db.getMessagesForRoom(data);
        await tg.sendMessagesForRoom(bot, msg.chat.id, messages);
    }

    const messageText = status === 'good'
        ? `🤖 Замечания (${count}) переданы не будут ${STATUS_ROOM_GOOD}\n\n${destination}`
        : `🤖 Вы можете дополнить ${count} замечаний, пишите мне в ответ, подкрепляя фотографиями!\n\n${room.intermediate_message}\n\n${destination}`;

    const inline_keyboard = [
        [{ text: 'Назад к отделу', callback_data: `back_to_${department}` }]
    ];

    if (status === 'good') {
        inline_keyboard.unshift([{ text: `${STATUS_ROOM_COMMENTED} Открыть замечания ${STATUS_ROOM_COMMENTED}`, callback_data: `open_comments_${data}` }]);
    } else {
        inline_keyboard.unshift([{ text: `${STATUS_ROOM_GOOD} Всё ок, закрыть замечания ${STATUS_ROOM_GOOD}`, callback_data: `mark_good_${data}` }]);
    }

    bot.sendMessage(msg.chat.id, messageText, { reply_markup: { inline_keyboard } });
};

// Команда /start
bot.onText(/\/start/, async (msg) => {
    await tg.sendMainMenu(bot, msg.chat.id);
});

// Получение сообщения
bot.on('message', async (msg) => {
    if (msg.from.id !== bot.id) {
        await handleMessage(msg);
    }
});

// Нажатие кнопки
bot.on('callback_query', async (callbackQuery) => {
    await handleCallbackQuery(callbackQuery);
});

console.log('https://t.me/g1_remarks_bot');
