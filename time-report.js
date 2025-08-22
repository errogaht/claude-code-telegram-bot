#!/usr/bin/env node

/**
 * ActivityWatch Time Report Generator for it-fit project
 * Usage: node time-report.js [days] [project]
 */

const axios = require('axios');
const fs = require('fs');

const ACTIVITY_WATCH_URL = 'http://localhost:5600/api/0';
const BUCKET_ID = 'claude-bot-sessions';

async function getTimeReport(days = 7, project = 'it-fit') {
    try {
        console.log(`\n📊 Time Report for ${project} project (last ${days} days)\n`);

        // Get events from the last N days
        const response = await axios.get(`${ACTIVITY_WATCH_URL}/buckets/${BUCKET_ID}/events?limit=1000`);
        const events = response.data;

        // Filter by project and date range
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - days);

        const projectEvents = events.filter(event => {
            const eventDate = new Date(event.timestamp);
            return event.data.project === project && eventDate >= cutoffDate;
        });

        if (projectEvents.length === 0) {
            console.log(`❌ No sessions found for project "${project}" in the last ${days} days`);
            return;
        }

        // Group by date
        const dailyStats = {};
        let totalOriginalTime = 0;
        let totalRecordedTime = 0;
        let totalSessions = 0;

        projectEvents.forEach(event => {
            const date = event.timestamp.split('T')[0];
            const originalDuration = event.data.original_duration || event.duration;
            const recordedDuration = event.duration;

            if (!dailyStats[date]) {
                dailyStats[date] = {
                    sessions: 0,
                    originalTime: 0,
                    recordedTime: 0,
                    multiplier: event.data.time_multiplier || 1
                };
            }

            dailyStats[date].sessions++;
            dailyStats[date].originalTime += originalDuration;
            dailyStats[date].recordedTime += recordedDuration;

            totalOriginalTime += originalDuration;
            totalRecordedTime += recordedDuration;
            totalSessions++;
        });

        // Display daily breakdown
        console.log('📅 Daily Breakdown:');
        console.log('=' .repeat(60));
        Object.keys(dailyStats).sort().forEach(date => {
            const stats = dailyStats[date];
            const originalHours = stats.originalTime / 3600;
            const recordedHours = stats.recordedTime / 3600;
            
            console.log(`${date}: ${stats.sessions} sessions | ${originalHours.toFixed(2)}h actual → ${recordedHours.toFixed(2)}h recorded (${stats.multiplier}x)`);
        });

        // Display totals
        console.log('\n' + '=' .repeat(60));
        console.log('📈 TOTALS:');
        console.log(`Sessions: ${totalSessions}`);
        console.log(`Actual work time: ${(totalOriginalTime / 3600).toFixed(2)} hours`);
        console.log(`Recorded time: ${(totalRecordedTime / 3600).toFixed(2)} hours`);
        console.log(`Time multiplier: ${projectEvents[0]?.data?.time_multiplier || 1}x`);

        // Create CSV export for client
        const csvData = [
            'Date,Sessions,Actual Hours,Recorded Hours,Multiplier'
        ];

        Object.keys(dailyStats).sort().forEach(date => {
            const stats = dailyStats[date];
            csvData.push(`${date},${stats.sessions},${(stats.originalTime / 3600).toFixed(2)},${(stats.recordedTime / 3600).toFixed(2)},${stats.multiplier}`);
        });

        // Add total row
        csvData.push(`TOTAL,${totalSessions},${(totalOriginalTime / 3600).toFixed(2)},${(totalRecordedTime / 3600).toFixed(2)},`);

        const csvFilename = `${project}-time-report-${new Date().toISOString().split('T')[0]}.csv`;
        fs.writeFileSync(csvFilename, csvData.join('\n'));
        
        console.log(`\n💾 CSV report saved as: ${csvFilename}`);
        console.log('\n💡 Tips:');
        console.log('• Send the CSV file to your client');
        console.log('• Use "Recorded Hours" for billing');
        console.log('• "Actual Hours" shows your real work time');

    } catch (error) {
        console.error('❌ Error generating report:', error.message);
        console.log('\n🔧 Troubleshooting:');
        console.log('• Check if ActivityWatch is running: curl http://localhost:5600/api/0/info');
        console.log('• Check if Claude bot bucket exists');
    }
}

// Parse command line arguments
const days = parseInt(process.argv[2]) || 7;
const project = process.argv[3] || 'it-fit';

getTimeReport(days, project);