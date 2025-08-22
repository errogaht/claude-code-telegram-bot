#!/usr/bin/env node

/**
 * Полный отчет времени для клиента: обычное время + время бота
 * Usage: node client-time.js [дни] [проект]
 */

const axios = require('axios');

const ACTIVITY_WATCH_URL = 'http://localhost:5600/api/0';
const BOT_BUCKET = 'claude-bot-sessions';
const WINDOW_BUCKET = 'aw-watcher-window_errogaht-G1619-04';

async function getClientTime(days = 1, project = 'it-fit') {
    try {
        console.log(`\n💰 ВРЕМЯ ДЛЯ КЛИЕНТА: проект "${project}" (${days} дн.)\n`);

        // 1. ПОЛУЧИТЬ ВРЕМЯ БОТА (с множителем)
        let botTime = 0, botOriginalTime = 0, multiplier = 1, botEvents = [];
        
        try {
            const botResponse = await axios.get(`${ACTIVITY_WATCH_URL}/buckets/${BOT_BUCKET}/events?limit=100`, {timeout: 5000});
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - days);

            botEvents = botResponse.data.filter(event => {
                const eventDate = new Date(event.timestamp);
                return event.data.project === project && eventDate >= cutoffDate;
            });

            botTime = botEvents.reduce((sum, event) => sum + event.duration, 0) / 3600; // в часах
            botOriginalTime = botEvents.reduce((sum, event) => sum + (event.data.original_duration || event.duration), 0) / 3600;
            multiplier = botEvents[0]?.data?.time_multiplier || 1;
        } catch (error) {
            console.log('⚠️ Не удалось получить время бота:', error.message);
        }

        // 2. ПОЛУЧИТЬ ОБЫЧНОЕ ВРЕМЯ (окна/приложения)  
        let windowTime = 0, windowEvents = [];
        
        try {
            const windowResponse = await axios.get(`${ACTIVITY_WATCH_URL}/buckets/${WINDOW_BUCKET}/events?limit=100`, {timeout: 5000});
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - days);
        
            const todayStr = new Date().toISOString().split('T')[0];
            if (days === 1) {
                // Для сегодня - точная дата
                windowEvents = windowResponse.data.filter(event => 
                    event.timestamp.startsWith(todayStr) && 
                    (event.data.title || '').toLowerCase().includes(project.toLowerCase())
                );
            } else {
                // Для нескольких дней - диапазон дат
                windowEvents = windowResponse.data.filter(event => {
                    const eventDate = new Date(event.timestamp);
                    return eventDate >= cutoffDate && 
                           (event.data.title || '').toLowerCase().includes(project.toLowerCase());
                });
            }

            windowTime = windowEvents.reduce((sum, event) => sum + event.duration, 0) / 3600; // в часах
        } catch (error) {
            console.log('⚠️ Не удалось получить обычное время:', error.message);
        }

        // 3. ИТОГИ
        const totalTime = windowTime + botTime;
        
        console.log('📊 РАЗБИВКА:');
        console.log('=' .repeat(50));
        console.log(`🖥️  Обычная работа (окна):     ${windowTime.toFixed(2)} ч`);
        console.log(`🤖 Работа с ботом:            ${botOriginalTime.toFixed(2)} ч → ${botTime.toFixed(2)} ч (${multiplier}x)`);
        console.log('=' .repeat(50));
        console.log(`💰 ИТОГО ДЛЯ КЛИЕНТА:         ${totalTime.toFixed(2)} ч`);
        
        // 4. ДЕТАЛИ
        console.log(`\n📈 ДЕТАЛИ:`);
        console.log(`- Обычное время: ${windowEvents.length} событий, ${windowTime.toFixed(2)} часов`);
        console.log(`- Время бота: ${botEvents.length} сессий, ${botTime.toFixed(2)} часов (множитель ${multiplier}x)`);
        console.log(`- Дата: ${days === 1 ? 'сегодня' : `последние ${days} дней`}`);

        // 5. ДЛЯ КОПИРОВАНИЯ КЛИЕНТУ
        console.log(`\n📝 ДЛЯ КЛИЕНТА:`);
        console.log(`Проект: ${project}`);
        console.log(`Дата: ${new Date().toLocaleDateString('ru-RU')}`);
        console.log(`Время работы: ${totalTime.toFixed(2)} часов`);

        return {
            windowTime: windowTime,
            botTime: botTime,
            totalTime: totalTime,
            botSessions: botEvents.length,
            windowEvents: windowEvents.length
        };

    } catch (error) {
        console.error('❌ Ошибка:', error.message);
        console.log('\n🔧 Проверь:');
        console.log('• ActivityWatch запущен: curl http://localhost:5600/api/0/info');
        console.log('• Бот записывает время');
    }
}

// Запуск
const days = parseInt(process.argv[2]) || 1;
const project = process.argv[3] || 'it-fit';

getClientTime(days, project);