const cron = require("node-cron");
const { resetDailyUsage } = require("./resetDailyUsage");

// Schedule task to run every day at midnight (00:00)
cron.schedule("0 0 * * *", async () => {
  console.log("Starting daily quota reset job...");
  await resetDailyUsage();
  console.log("Daily quota reset job completed.");
});
