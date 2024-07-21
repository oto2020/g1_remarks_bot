// controllers/dbController.js

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();


// Get user by Chat ID
async function createUser(data) {
    user = await prisma.user.create({
        data: data
    });
}

// Get user by Chat ID
async function getUser(chatId) {
    let user = await prisma.user.findUnique({
        where: { chatId }
    });
    return user;
}

// Save message
async function saveMessage(chatId, callbackData, content, type, text = null) {
    const user = await getUser(chatId);
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


// Get count of messages for a room
async function getMessageCountForRoom(callbackData) {
    try {
        const count = await prisma.message.count({
            where: {
                callbackData: callbackData,
                type: {
                    not: 'status'
                }
            }
        });
        return count;
    } catch (error) {
        console.error("Error getting message count for room:", error);
        throw error; // Проброс ошибки для дальнейшей обработки, если необходимо
    }
}

// Get count of messages for a room
async function getMessageStatusGoodCountForRoom(callbackData) {
    try {
        const count = await prisma.message.count({
            where: {
                callbackData: callbackData,
                type: 'status',
                content: 'good'
            }
        });
        return count;
    } catch (error) {
        console.error("Error getting message satus good count for room:", error);
        throw error; // Проброс ошибки для дальнейшей обработки, если необходимо
    }
}




// Get all messages for a room
async function getMessagesForRoom(callbackData) {
    return await prisma.message.findMany({
        where: { callbackData },
        orderBy: { timestamp: 'asc' },
        include: {
            user: true,
        },
    });
}



// Save room status message
async function saveRoomStatus(chatId, callbackData, status) {
    await prisma.message.deleteMany({
        where: { 
            callbackData: callbackData,
            type: 'status'
         }
    });

    const user = await getUser(chatId);
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
    createUser,
    getUser,
    saveMessage,
    getMessageCountForRoom,
    getMessageStatusGoodCountForRoom,
    getMessagesForRoom,
    saveRoomStatus,
    getRoomStatus
};
