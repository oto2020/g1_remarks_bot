

const fs = require('fs');

const groupId = '-4263608042'; // Идентификатор группы

// // Load rooms data
// const rooms = JSON.parse(fs.readFileSync('rooms.json', 'utf8'));
// const getRoomByCallbackData = (callbackData) => {
//     for (const departmentKey in rooms) {
//         const department = rooms[departmentKey];
//         const room = department.rooms.find(room => room.callback_data === callbackData);
//         if (room) {
//             return {
//                 departmentKey: departmentKey,
//                 departmentTitle: department.title,
//                 roomName: room.name,
//                 roomIntermediateMessage: room.intermediate_message,
//                 roomCallbackData: room.callback_data
//             };
//         }
//     }
//     return null; // Возвращает null, если помещение не найдено
// };

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
        let messageText = '👤 ' + message.text;
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


// async function functionName () {};
module.exports = {
    sendMessagesForRoom,
    // getCallbackData,
    // getAllMessages,
    // getMessageCountForRoom,
    // getMessageStatusGoodCountForRoom,
    // getMessagesForRoom,
    // saveRoomStatus,
    // getRoomStatus
};
