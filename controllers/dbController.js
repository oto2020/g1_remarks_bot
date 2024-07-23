// controllers/dbController.js

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { startOfDay, endOfDay } = require('date-fns');


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
                },
                timestamp: {
                    gte: startOfDay(new Date()),
                    lt: endOfDay(new Date())
                }
            }
        });
        return count;
    } catch (error) {
        console.error("Error getting message count for room:", error);
        throw error;
    }
}

//  Get count of messages for a room
async function getMessageStatusGoodCountForRoom(callbackData) {
    try {
        const count = await prisma.message.count({
            where: {
                callbackData: callbackData,
                type: 'status',
                content: 'good',
                timestamp: {
                    gte: startOfDay(new Date()),
                    lt: endOfDay(new Date())
                }
            }
        });
        return count;
    } catch (error) {
        console.error("Error getting message status good count for room:", error);
        throw error;
    }
}

// Get all messages for a room
async function getMessagesForRoom(callbackData) {
    try {
        return await prisma.message.findMany({
            where: {
                callbackData: callbackData,
                timestamp: {
                    gte: startOfDay(new Date()),
                    lt: endOfDay(new Date())
                }
            },
            orderBy: { timestamp: 'asc' },
            include: {
                user: true,
            },
        });
    } catch (error) {
        console.error("Error getting messages for room:", error);
        throw error;
    }
}

// Save room status message
async function saveRoomStatus(chatId, callbackData, status) {
    await prisma.message.deleteMany({
        where: { 
            callbackData: callbackData,
            type: 'status',
            timestamp: {
                gte: startOfDay(new Date()),
                lt: endOfDay(new Date())
            }
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
        where: { 
            callbackData, type: 'status',
            timestamp: {
                gte: startOfDay(new Date()),
                lt: endOfDay(new Date())
            }
        },
        orderBy: { timestamp: 'desc' }
    });
    return statusMessage ? statusMessage.content : 'pending';
}


// Get all remarks for a user excluding those with type 'status'
async function getRemarksForDayRoom(callbackData, day) {
    try {
        const messages = await prisma.message.findMany({
            where: {
                callbackData: callbackData,
                timestamp: {
                    gte: startOfDay(day),
                    lt: endOfDay(day)
                }
            },
            orderBy: { timestamp: 'asc' },
            include: {
                user: true,
            },
        });
        return messages;
    } catch (error) {
        console.error("Error getting messages for user:", error);
        throw error;
    }
}



module.exports = {
    createUser,
    getUser,
    saveMessage,
    getMessageCountForRoom,
    getMessageStatusGoodCountForRoom,
    getMessagesForRoom,
    saveRoomStatus,
    getRoomStatus,
    getRemarksForDayRoom
};
