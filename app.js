// app.js

require('dotenv').config();
const fs = require('fs');
const TelegramBot = require('node-telegram-bot-api');
const db = require('./controllers/dbController');
const tg = require('./controllers/tgController');

const token = process.env.TOKEN;
const bot = new TelegramBot(token, { polling: true });

const groupId = '-4263608042'; // Идентификатор группы

// Определение шагов регистрации
const STEPS = {
    CONTACT: 0,     // ожидание контакта
    NAME: 1,        // ожидание имени
    POSITION: 2,    // ожидание должности
    COMPLETED: 3    // регистрация завершена
};

// STEPS шаги регистрации
// room: 'none' или *callbackData их rooms.json*
// phoneNumber
// name
// position
const userStatuses = new Map();

function userStatusInit(chatId) {
    // для любого нового chatId создаем новый элемент коллекции
    if (!userStatuses.has(chatId)) {
        userStatuses.set(chatId, { step: STEPS.CONTACT, room: 'none', phoneNumber: 0, name: "", position: "" });
        return true;
    } 
    else {
        return false;
    }
}
// не пропустит, пока пользователь не будет создан в БД
async function registrationMiddleware(chatId) {
    // для любого нового chatId создаем новый элемент коллекции
    userStatusInit(chatId);
    // смотрим на наличие в БД
    let user = await db.getUser(chatId);
    if (user) {
        userStatuses.get(chatId).step = STEPS.COMPLETED;
        return true;
    }
    // клиента нет в базе 
    if (!user) {
        // по запросу контакта он не был сохранен в userStatuses в обработчике bot.on('contact'
        if (userStatuses.get(chatId).step === STEPS.CONTACT) {
            tg.sendContactRequest(bot, chatId); 
            // Обработчик полученного контакта расположен в bot.on('contact'
            return false;
        }
        if (userStatuses.get(chatId).step === STEPS.NAME) {
            bot.sendMessage(chatId, `🤖 Ваше имя:`); 
            // Обработчик полученного сообщения расположен в bot.on('message'
            return false;
        }
        if (userStatuses.get(chatId).step === STEPS.POSITION) {
            bot.sendMessage(chatId, `🤖 Ваша должность:`);
            // Обработчик полученного сообщения расположен в bot.on('message'
            return false;
        }
        if (userStatuses.get(chatId).step === STEPS.COMPLETED) {
            // Пользователь не существует, шаг == COMPLETED
            // СОХРАНЕНИЕ В БД
            await db.createUser({
                chatId: chatId,
                name: userStatuses.get(chatId).name,
                phoneNumber: userStatuses.get(chatId).phoneNumber,
                position: userStatuses.get(chatId).position
            });
            let user = await db.getUser(chatId);
            bot.sendMessage(chatId, `🤖 Благодарим за регистрацию, ${user.position} ${user.name}, ${user.phoneNumber}`);
            tg.sendMainMenu(bot, chatId);
            return true;
        }
    }

}

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
    // userStatus changing
    userStatuses.get(chatId).room = 'none';
};

const sendBackButton = (departmentKey) => ({
    reply_markup: {
        inline_keyboard: [[{ text: 'Назад к отделу', callback_data: `back_to_${departmentKey}` }]]
    }
});

const handleMessage = async (msg) => {
    const callbackData = userStatuses.get(msg.chat.id).room;
    if (callbackData === 'none') {
        await tg.sendMainMenu(bot, msg.chat.id);
        return;
    }

    if (msg.text) {
        await db.saveMessage( msg.chat.id, callbackData, msg.text, 'text', msg.text);
    } else if (msg.photo) {
        const fileId = msg.photo[msg.photo.length - 1].file_id;
        const caption = msg.caption || null;
        await db.saveMessage(msg.chat.id, callbackData, fileId, 'photo', caption);
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
        await db.saveRoomStatus(callbackQuery.from.id, roomCallbackData, 'good');
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
        await db.saveRoomStatus(callbackQuery.from.id, roomCallbackData, 'pending');
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
        // userStatus changing
        userStatuses.get(callbackQuery.from.id).room = 'none';
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

    // userStatus changing
    userStatuses.get(callbackQuery.from.id).room = data;
;
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


// Обработчик получения контакта
bot.on('contact', async (msg) => {
    const chatId = msg.chat.id;
    userStatusInit(chatId);
    const contact = msg.contact;
    if (contact) {
        bot.sendMessage(chatId, `Спасибо за предоставление вашего контакта: ${contact.phone_number}`);
        userStatuses.get(chatId).phoneNumber = contact.phone_number;
        userStatuses.get(chatId).step = STEPS.NAME; // следущий этап
        // продолдение со следующего этапа
        await registrationMiddleware(chatId);
    } else {
        bot.sendMessage(chatId, 'Не удалось получить контакт.');
    }
});

// Команда /start
bot.onText(/\/start/, async (msg) => {
    console.log('start', msg.date);
    if(!await registrationMiddleware(msg.chat.id)) {
        console.log(`/start stopped by registrationMiddleware`);
        return;
    }
    await tg.sendMainMenu(bot, msg.chat.id);
});

// Получение сообщения
bot.on('message', async (msg) => {
    // Этот обработчик не будет реагировать на сообщения с контактом и на сообщения от самого себя
    if (msg.contact || msg.from.id === bot.id) {
        return;
    }

    // Если пришло сообщение и мы ничего не знаем о пользователе
    if (!userStatuses.get(msg.chat.id)) {
        // Здесь он будет автоматически создан
        if(!await registrationMiddleware(msg.chat.id)) {
            return;
        }
    }
    if (userStatuses.get(msg.chat.id).step === STEPS.NAME) {
        userStatuses.get(msg.chat.id).name = msg.text;
        userStatuses.get(msg.chat.id).step++;
        await registrationMiddleware(msg.chat.id);
        return;
        // имя заполнено, продолжаем обработку
    }
    if (userStatuses.get(msg.chat.id).step === STEPS.POSITION) {
        userStatuses.get(msg.chat.id).position = msg.text;
        userStatuses.get(msg.chat.id).step++;
        await registrationMiddleware(msg.chat.id);
        return;
        // должность заполнена, продолжаем обработку
    }

    console.log(`message`, msg);
    let userRegistered = await registrationMiddleware(msg.chat.id);
    if(!userRegistered) {
        console.log(`message stopped by registrationMiddleware`);
        return;
    }
    await handleMessage(msg);
});

// Нажатие кнопки
bot.on('callback_query', async (callbackQuery) => {
    console.log(`callback_query`, callbackQuery.data);
    if (!await registrationMiddleware(callbackQuery.from.id)) {
        console.log(`callback_query stopped by registrationMiddleware`);
        return;
    }
    handleCallbackQuery(callbackQuery);
});

console.log('https://t.me/g1_remarks_bot');
