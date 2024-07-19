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


const STATUS_DEPARTMENT_FULL = '✅';       // check
const STATUS_DEPARTMENT_PARTLY = '☑️';     // check
const STATUS_DEPARTMENT_EMPTY = '✖️';
const STATUS_ROOM_GOOD = '👍';       // 100%
const STATUS_ROOM_COMMENTED = '✍️';       // 100%
const STATUS_ROOM_VIEWED = '✔';    //
const STATUS_ROOM_EMPTY = '✖️';

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







// Start command
bot.onText(/\/start/, async (msg) => {
    await db.saveMessage(msg.from.id.toString(), msg.chat.id, null, msg.text, 'text', msg.text);
    bot.sendMessage(msg.chat.id, 'Выберите отдел:', await generateMainMenu());
});

// Message handler
bot.on('message', async (msg) => {
    if (msg.from.id !== bot.id) {
        const callbackData = await db.getCallbackData(msg.from.id.toString());
        if (callbackData == 'none') {
            bot.sendMessage(msg.chat.id, 'Выберите отдел:', await generateMainMenu());
            return;
        }
        console.log(callbackData);

        if (msg.text) {
            await db.saveMessage(msg.from.id.toString(), msg.chat.id, callbackData, msg.text, 'text', msg.text);
        } else if (msg.photo) {
            const fileId = msg.photo[msg.photo.length - 1].file_id;
            const caption = msg.caption || null; // Получаем подпись к фото, если она есть
            await db.saveMessage(msg.from.id.toString(), msg.chat.id, callbackData, fileId, 'photo', caption);
        }

        
        const count = await db.getMessageCountForRoom(callbackData);
        let room = getRoomByCallbackData(callbackData);
        // console.log(room);
        if (!room) return;
        bot.sendMessage(msg.chat.id, `🤖 Спасибо!\nСообщения (${count}) дополнены.\nВы можете продолжить в этом чате или перейти к следующей комнате.`, backButtonForDepartmentKey(room.departmentKey));
    }
});

bot.on('callback_query', async (callbackQuery) => {
    const msg = callbackQuery.message;
    const data = callbackQuery.data;

    if (data.startsWith('mark_good_')) {
        const roomCallbackData = data.replace('mark_good_', '');
        await db.saveRoomStatus(callbackQuery.from.id.toString(), roomCallbackData, 'good');
        const count = await db.getMessageCountForRoom(roomCallbackData);
        let room = getRoomByCallbackData(roomCallbackData);

        // Send confirmation message
        await bot.sendMessage(msg.chat.id, `🤖 Комната отмечена как в порядке ${STATUS_ROOM_GOOD} \nЗамечания (${count}) переданы не будут!`);

        // Simulate pressing "back to department" button by sending a new message with department menu
        await bot.sendMessage(msg.chat.id, `Вы вернулись к отделу: \n📍${rooms[room.departmentKey].title}`, await generateRoomMenu(room.departmentKey));
        await db.updateUserRoom(callbackQuery.from.id.toString(), 'none');
        return;
    }

    if (data.startsWith('open_comments_')) {
        const roomCallbackData = data.replace('open_comments_', '');
        await db.saveRoomStatus(callbackQuery.from.id.toString(), roomCallbackData, 'pending');
        let room = getRoomByCallbackData(roomCallbackData);
        const count = await db.getMessageCountForRoom(roomCallbackData);
        
        const messages = await db.getMessagesForRoom(roomCallbackData);
        await tg.sendMessagesForRoom(bot, msg.chat.id, messages);

        bot.sendMessage(msg.chat.id, `Вы можете продолжать комментировать.\nЗамечания открыты ${STATUS_ROOM_COMMENTED}`, backButtonForDepartmentKey(room.departmentKey));
        return;
    }

    if (data === 'back_to_departments') {
        bot.sendMessage(msg.chat.id, 'Выберите отдел:', await generateMainMenu());
        await db.updateUserRoom(callbackQuery.from.id.toString(), 'none');
    } else if (rooms[data]) {
        bot.sendMessage(msg.chat.id, `📍 ${rooms[data].title}\nВыберите помещение:`, await generateRoomMenu(data));
        await db.updateUserRoom(callbackQuery.from.id.toString(), 'none');
    } else {
        let found = false;
        for (const department in rooms) {
            const room = rooms[department].rooms.find(r => r.callback_data === data);
            if (room) {
                let destination = `📍 ${rooms[department].title}\n➡️ ${room.name}`;

                const count = await db.getMessageCountForRoom(data);
                const status = await db.getRoomStatus(data);

                await db.updateUserRoom(callbackQuery.from.id.toString(), data);
                if (status !== 'good') {
                    const messages = await db.getMessagesForRoom(data);
                    await tg.sendMessagesForRoom(bot, msg.chat.id, messages);
                }
                let messageText = `🤖 Вы можете дополнить ${count} замечаний, пишите мне в ответ, подкрепляя фотографиями!\n\n${room.intermediate_message}\n\n${destination}`;
                if (status === 'good') {
                    messageText = `🤖 Замечания (${count}) переданы не будут ${STATUS_ROOM_GOOD} \n\n ${destination}`;
                }
                
                const inline_keyboard = [
                    [{ text: 'Назад к отделу', callback_data: `back_to_${department}` }]
                ];

                if (status === 'good') {
                    inline_keyboard.unshift([{ text: `${STATUS_ROOM_COMMENTED} Открыть замечания ${STATUS_ROOM_COMMENTED}`, callback_data: `open_comments_${data}` }]);
                } else {
                    inline_keyboard.unshift([{ text: `${STATUS_ROOM_GOOD} Всё ок, закрыть замечания ${STATUS_ROOM_GOOD}`, callback_data: `mark_good_${data}` }]);
                }

                bot.sendMessage(msg.chat.id, messageText, {
                    reply_markup: { inline_keyboard }
                });
                found = true;
                break;
            } else if (data === `back_to_${department}`) {
                bot.sendMessage(msg.chat.id, `Вы вернулись к отделу: \n📍${rooms[department].title}`, await generateRoomMenu(department));
                await db.updateUserRoom(callbackQuery.from.id.toString(), 'none');
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
