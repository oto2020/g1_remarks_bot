const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Create or get user by Telegram ID
async function getUser(telegramId) {
    let user = await prisma.user.findUnique({
        where: { telegramId }
    });
    if (!user) {
        user = await prisma.user.create({
            data: { telegramId }
        });
    }
    return user;
}

// Save message
async function saveMessage(telegramId, chatId, callbackData, content, type, text = null) {
    const user = await getUser(telegramId);
    return await prisma.message.create({
        data: {
            content,
            type,
            userId: user.id,
            text,
            chatId,
            callbackData
        }
    });
}

// Update current room for user
async function updateUserRoom(telegramId, currentRoom) {
    if (!telegramId || !currentRoom) {
        console.log('ошибка, связанная с ', telegramId, currentRoom);
        return;
    }
    return await prisma.user.update({
        where: { telegramId },
        data: { currentRoom },
    });
}

// Get current room for user
async function getCallbackData(telegramId) {
    const user = await getUser(telegramId);
    return user.currentRoom;
}

// Get all messages of a user
async function getAllMessages(telegramId) {
    const user = await getUser(telegramId);
    return await prisma.message.findMany({
        where: { userId: user.id },
        orderBy: { timestamp: 'asc' }
    });
}

// Get count of messages for a room
async function getMessageCountForRoom(callbackData) {
    return await prisma.message.count({
        where: { callbackData}
    });
}

// Get all messages for a room
async function getMessagesForRoom(callbackData) {
    return await prisma.message.findMany({
        where: { callbackData },
        orderBy: { timestamp: 'asc' }
    });
}


// Save room status message
async function saveRoomStatus(telegramId, callbackData, status) {
    const user = await getUser(telegramId);
    return await prisma.message.create({
        data: {
            content: status,
            type: 'status',
            userId: user.id,
            callbackData,
            chatId: user.id, // Assuming the chatId is the same as user ID for status messages
        }
    });
}

// Get room status
async function getRoomStatus(callbackData) {
    const statusMessage = await prisma.message.findFirst({
        where: { callbackData, type: 'status' },
        orderBy: { timestamp: 'desc' }
    });
    return statusMessage ? statusMessage.content : 'pending';
}
module.exports = {
    getUser,
    saveMessage,
    updateUserRoom,
    getCallbackData,
    getAllMessages,
    getMessageCountForRoom,
    getMessagesForRoom,
    saveRoomStatus,
    getRoomStatus
};
