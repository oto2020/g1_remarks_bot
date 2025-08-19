// app.js

// Подключение необходимых модулей
const db = require('./controllers/dbController');
const tg = require('./controllers/tgController');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// Настройки
const groupId = process.env.GROUP_CHAT_ID; // ID группы, куда будут отправлены сообщения
const specificDate = "2024-12-23"; // Дата, за которую выгружаем замечания в формате "YYYY-MM-DD"

// Главная функция
async function exportRemarksForSpecificDate() {
    try {
        const rooms = await db.getRooms(); // Получаем список всех комнат (или секций)
        
        let roomsCount = 0;
        let messagesCount = 0;

        for (let section in rooms) {
            for (let room of rooms[section].rooms) {
                const roomCallbackData = room.callback_data;
                
                // Выгружаем замечания за указанную дату
                const msgs = await db.getRemarksForDayRoom(roomCallbackData, specificDate);
                
                if (msgs.length > 0 && !msgs.some(msg => msg.type === 'status' && msg.content === 'good')) {
                    roomsCount++;
                    messagesCount += msgs.length;
                    
                    console.log(`Замечания для комнаты ${roomCallbackData}:`, msgs);

                    // Отправка замечаний в группу Telegram
                    await tg.sendMessagesForRoom(groupId, msgs);
                    await delay(5000); // Задержка 5 секунд между отправками
                }
            }
        }

        console.log(`Всего обработано ${roomsCount} комнат и отправлено ${messagesCount} сообщений.`);
    } catch (error) {
        console.error("Ошибка при выгрузке и отправке замечаний:", error);
    }
}

// Запуск главной функции
exportRemarksForSpecificDate();
