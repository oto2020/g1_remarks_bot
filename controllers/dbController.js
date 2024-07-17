const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Create or get user by Telegram ID
async function getUser(telegramId) {
    return await prisma.user.upsert({
        where: { telegramId },
        update: {},
        create: { telegramId },
    });
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
    console.log(telegramId, currentRoom);
    try {
        return await prisma.user.update({
            where: { telegramId },
            data: { currentRoom },
        });
    } catch (e) {
        console.log('error\n')
    }
}

// Get current room for user
async function getCurrentRoom(telegramId) {
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

module.exports = {
    getUser,
    saveMessage,
    updateUserRoom,
    getCurrentRoom,
    getAllMessages
};
