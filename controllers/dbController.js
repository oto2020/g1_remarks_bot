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
async function saveMessage(telegramId, content, type, text = null) {
    const user = await getUser(telegramId);
    return await prisma.message.create({
        data: {
            content,
            type,
            userId: user.id,
            text
        }
    });
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
    getAllMessages
};
